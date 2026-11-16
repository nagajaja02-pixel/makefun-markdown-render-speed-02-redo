// Block parsing and inline parsing deliberately have separate lifetimes: references
// may be defined after the paragraph that uses them, including inside containers.
const punctuation = /[\p{P}\p{S}]/u;
const escapes = /\\([!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~])/g;
const special = /[&<>"']/g;
const escapedChars = {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
function escape(s, all = false) {
  if(!/[&<>"']/.test(s)) return s;
  return s.replace(all ? special : /&(?!(?:#\d+|#x[\da-fA-F]+|\w+);)|[<>"']/g, c => escapedChars[c]);
}
function unescape(s) { return s.includes('\\')?s.replace(escapes, '$1'):s; }
function label(s) { return s.replace(/\s+/g, ' ').trim().toUpperCase().toLowerCase().replace(/ẞ/g,'ss').replace(/ß/g,'ss'); }
function href(s) {
  try { return encodeURI(s).replace(/%25/g, '%'); } catch { return null; }
}
function indent(s) {
  let col=0, i=0;
  for (; i<s.length; i++) {
    if(s[i]===' ') col++;
    else if(s[i]==='\t') col+=4-col%4;
    else break;
  }
  return [col,i];
}
function strip(s,n) {
  let col=0,i=0;
  while(i<s.length && col<n && (s[i]===' ' || s[i]==='\t')) {
    col+=s[i++]==='\t' ? 4-col%4 : 1;
  }
  return ' '.repeat(Math.max(0,col-n))+s.slice(i);
}
function expandIndent(s) {const [col,n]=indent(s);return ' '.repeat(col)+s.slice(n);}
function expandQuote(s) {let col=0;return s.replace(/^ *?>[ \t]*/,m=>{let out='';for(const c of m) {if(c==='\t') {const n=4-col%4;out+=' '.repeat(n);col+=n;}else {out+=c;col++;}}return out;});}
const blankRE=/^[ \t]*$/;
const hrRE=/^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/;
const fenceRE=/^ {0,3}(`{3,}(?!.*`)|~{3,})([^\n]*)$/;
const headingRE=/^ {0,3}(#{1,6})(?:[ \t]+(.*)|[ \t]*)$/;
const bulletRE=/^( {0,3})([*+-]|\d{1,9}[.)])(?:([ \t]+)(.*)|$)/;
const blank=s=>blankRE.test(s),hr=s=>hrRE.test(s);
const fence=s=>fenceRE.exec(s),heading=s=>headingRE.exec(s),bullet=s=>bulletRE.exec(s);
const blockTags = 'address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul';
const blockTagRE = new RegExp('^ {0,3}</?(?:'+blockTags+')(?=[ \\t/>]|$)','i');
const completeTag = /^ {0,3}(?:<[A-Za-z][A-Za-z\d-]*(?:\s+[A-Za-z_:][\w:.-]*(?:\s*=\s*(?:[^\s"'=<>`]+|'[^']*'|"[^"]*"))?)*\s*\/?>|<\/[A-Za-z][A-Za-z\d-]*\s*>)[ \t]*$/;
function htmlType(s, interrupt=false) {
  let pos=0;while(pos<4&&s[pos]===' ')pos++;if(pos>3||s[pos]!=='<')return null;
  const t=s.replace(/^ {0,3}/,'');
  const m=/^<(script|pre|style|textarea)(?=[\s>]|$)/i.exec(t);
  if(m) return [1,new RegExp('</'+m[1]+'\\s*>','i')];
  if(t.startsWith('<!--')) return [2,/-->/];
  if(t.startsWith('<?')) return [3,/\?>/];
  if(/^<![A-Z]/.test(t)) return [4,/>/];
  if(t.startsWith('<![CDATA[')) return [5,/\]\]>/];
  if(blockTagRE.test(s)) return [6,null];
  if(!interrupt && completeTag.test(s)) return [7,null];
  return null;
}
function interrupts(s) {
  if(blank(s)) return true;
  let i=0;while(i<4&&s[i]===' ')i++;
  if(i>3) return false;
  const c=s[i];
  if(c==='>') return true;
  if(c==='#') return !!heading(s);
  if(c==='`'||c==='~') return !!fence(s);
  if(c==='<') return !!htmlType(s,true);
  if(c!=='*'&&c!=='_'&&c!=='-'&&c!=='+'&&!(c>='0'&&c<='9')) return false;
  if(hr(s)) return true;
  const m=bullet(s);
  return !!(m && m[4] && (!/\d/.test(m[2][0]) || parseInt(m[2])===1));
}
function cells(s) {
  s=s.trim();
  if(s[0]==='|') s=s.slice(1);
  if(s.endsWith('|')) {let k=s.length-2;while(k>=0&&s[k]==='\\')k--;if((s.length-2-k)%2===0)s=s.slice(0,-1);}
  const out=[];let current='',slashes=0;
  for(let i=0;i<s.length;i++) {
    const c=s[i];
    if(c==='|') {
      if(slashes%2) current=current.slice(0,-1)+'|';
      else {out.push(current.trim());current='';}
    } else current+=c;
    slashes=c==='\\'?slashes+1:0;
  }
  out.push(current.trim());return out;
}
function tableStart(lines,i) {
  if(i+1>=lines.length || !lines[i].includes('|')) return null;
  const div=cells(lines[i+1]);
  if(!div.length || div.some(x=>!/^:?-+:?$/.test(x))) return null;
  const head=cells(lines[i]);
  return head.length===div.length ? {head,align:div.map(x=>x[0]===':'?(x.endsWith(':')?'center':'left'):(x.endsWith(':')?'right':null))} : null;
}
// Parse a destination without interpreting its text. Angle destinations and bare
// destinations have different whitespace and parenthesis rules.
function destination(s,p,definition=false) {
  let start=p;
  if(s[p]==='<') {
    p++; start=p;
    while(p<s.length) {
      if(s[p]==='\\' && p+1<s.length) {p+=2;continue;}
      if(s[p]==='>') return {url:s.slice(start,p),end:p+1};
      if(s[p]==='\n' || s[p]==='<') return null;
      p++;
    }
    return null;
  }
  let depth=0;
  while(p<s.length) {
    const c=s[p];
    if(c==='\\' && p+1<s.length) {p+=2;continue;}
    if(c==='(') depth++;
    else if(c===')') {if(!depth) break;depth--;}
    if(c===' '||c==='\t'||c==='\n'||c==='\r') break;
    p++;
  }
  if(depth) return null;
  return {url:s.slice(start,p),end:p};
}
function titleAt(s,p) {
  const quote=s[p], close=quote==='('?')':quote;
  if(!['"',"'",'('].includes(quote)) return null;
  const start=++p;
  while(p<s.length) {
    if(s[p]==='\\' && p+1<s.length) {p+=2;continue;}
    if(s[p]===close) return {title:s.slice(start,p),end:p+1};
    if(quote==='(' && s[p]==='(') return null;
    p++;
  }
  return null;
}
function definitionAt(lines,i) {
  if(!/^ {0,3}\[/.test(lines[i])) return null;
  let boundary=i+1;while(boundary<lines.length && !blank(lines[boundary])) boundary++;
  let s=lines.slice(i,boundary).join('\n');
  const m=/^ {0,3}\[((?:\\.|[^\[\]\\])+)]\:[ \t]*(?:\n[ \t]*)?/.exec(s);
  if(!m || !label(m[1]) || /\n[ \t]*\n/.test(m[1])) return null;
  const d=destination(s,m[0].length,true);
  if(!d || (!d.url && s[m[0].length]!=='<')) return null;
  let p=d.end, title='', end=p;
  const ws=/^[ \t]*(?:\n[ \t]*)?/.exec(s.slice(p))[0];
  const t=ws ? titleAt(s,p+ws.length):null;
  if(t && !/\n[ \t]*\n/.test(t.title) && /^[ \t]*(?:\n|$)/.test(s.slice(t.end))) {title=t.title;end=t.end;}
  else if(!/^[ \t]*(?:\n|$)/.test(s.slice(end))) return null;
  end+=/^[ \t]*/.exec(s.slice(end))[0].length;
  return {key:label(m[1]),url:unescape(d.url),title:unescape(title),count:s.slice(0,end).split('\n').length};
}
function blocks(lines,refs,top=true,lazy=new Set()) {
  const out=[];let gap=false,paragraphTop=top;
  function emit(t) {t.gap=gap;gap=false;out.push(t);if(t.type==='list'||t.type==='quote') paragraphTop=true;}
  for(let i=0;i<lines.length;) {
    const s=lines[i];
    if(blank(s)) {gap=true;i++;continue;}
    let m;
    if(indent(s)[0]>=4) {
      const body=[]; let j=i,last=i;
      while(j<lines.length && (indent(lines[j])[0]>=4 || blank(lines[j]))) {
        body.push(indent(lines[j])[0]>=4?strip(lines[j],4):'');
        if(!blank(lines[j])) last=body.length;
        j++;
      }
      emit({type:'code',text:body.slice(0,last).join('\n'),lang:''}); i=j;continue;
    }
    if((m=fence(s))) {
      const n=m[1].length,c=m[1][0], nspaces=m[1][0]==='`'?/^ */.exec(s)[0].length:0;
      const close=new RegExp('^ {0,3}'+c+'{'+n+',}[ \\t]*$');
      const body=[];let j=i+1;
      for(;j<lines.length && !close.test(lines[j]);j++) {
        let line=lines[j],k=0;while(k<nspaces && (line[k]===' '||line[k]==='\t')) k++;
        body.push(line.slice(k));
      }
      if(j===lines.length && body.at(-1)==='') body.pop();
      emit({type:'code',fenced:true,text:body.join('\n'),lang:unescape(m[2].trim())});i=j<lines.length?j+1:j;continue;
    }
    if((m=heading(s))) {
      let text=(m[2]||'').trim();text=text.replace(/(?:^|[ \t]+)#+[ \t]*$/,'').trim();
      emit({type:'heading',level:m[1].length,text});i++;continue;
    }
    if(hr(s)) {emit({type:'hr'});i++;continue;}
    if(/^ {0,3}>/.test(s)) {
      let j=i;const body=[],lazyBody=new Set();let prevBlank=false,lazyQuoteAllowed=null;
      while(j<lines.length) {
        const q=/^ {0,3}>[ \t]?/.exec(lines[j]);
        if(q) {const expanded=expandQuote(lines[j]);const prefix=/^ {0,3}> ?/.exec(expanded)[0];const content=expanded.slice(prefix.length);body.push(content);prevBlank=blank(content);lazyQuoteAllowed=null;j++;}
        else if(!blank(lines[j]) && !prevBlank && !interrupts(lines[j]) && !bullet(lines[j]) && (lazyQuoteAllowed??=lazyAllowed(blocks(body,new Map(),top)))) {lazyBody.add(body.length);body.push(/^ {0,3}(?:=+|-+)[ \t]*$/.test(lines[j])?'    '+lines[j].trim():(indent(lines[j])[0]>=4?strip(lines[j],4):lines[j]));j++;}
        else break;
      }
      emit({type:'quote',children:blocks(body,refs,true,lazyBody)});i=j;continue;
    }
    const ht=htmlType(s);
    if(ht) {
      let j=i;
      if(ht[1]) {while(j<lines.length) {if(ht[1].test(lines[j++])) break;}}
      else {while(j<lines.length && !blank(lines[j])) j++;}
      emit({type:'html',text:lines.slice(i,j).join('\n')+(j<lines.length && !((ht[0]>=6?blank(lines[j]):lines[j]==='') && j+1<lines.length)?'\n':'')});i=j;continue;
    }
    const def=definitionAt(lines,i);
    if(def) {if(!refs.has(def.key)) refs.set(def.key,def);emit({type:'def'});i+=def.count;continue;}
    if((m=bullet(s))) {
      const ordered=/\d/.test(m[2][0]), marker=ordered?m[2].at(-1):m[2];
      const items=[];let j=i,loose=false;
      while(j<lines.length) {
        const b=bullet(lines[j]);
        if(!b || (/\d/.test(b[2][0])!==ordered) || (ordered?b[2].at(-1):b[2])!==marker || hr(lines[j])) break;
        let content=b[4]||'', width=b[1].length+b[2].length;
        let ws=b[3]||' ';
        // Tabs after a marker are measured in the original source column.
        let col=width;for(const c of ws) col+=c==='\t'?4-col%4:1;
        let padding=col-width;
        if(padding>4) {content=' '.repeat(padding-1)+content;padding=1;}
        if(!content.trim()) padding=1;
        width+=padding;
        const body=[content],lazyBody=new Set();let k=j+1,hasBlank=false,trailBlank=false;
        while(k<lines.length) {
          const line=lines[k];
          if(blank(line)) {body.push('');trailBlank=true;k++;if(!content&&body.length===2) {while(k<lines.length&&blank(lines[k])) k++;break;}continue;}
          const ind=indent(line)[0];
          if(ind>=width) {if(trailBlank) hasBlank=true;body.push(strip(expandIndent(line),width));trailBlank=false;k++;continue;}
          if(bullet(line)||hr(line)||trailBlank||interrupts(line)||/^ {0,3}(?:`{3,}|~{3,})/.test(body.at(-1)||'')||htmlType(body.at(-1)||'',true)||heading(body.at(-1)||'')||hr(body.at(-1)||'')||indent(body.at(-1)||'')[0]>=4||/^ {0,3}(?:`{3,}|~{3,})/.test(line)) break;
          lazyBody.add(body.length);body.push(ind>=4?strip(line,4):line);k++;
        }
        
        if(trailBlank && k<lines.length) {const next=bullet(lines[k]);if(next && /\d/.test(next[2][0])===ordered && (ordered?next[2].at(-1):next[2])===marker) loose=true;}
        while(body.length && blank(body.at(-1))) body.pop();
        let task=null;
        if(/^\[[ xX]\](?:[ \t]+|$)/.test(body[0])) {task=/^\[[xX]\]/.test(body[0]);}
        const children=blocks(body,refs,false,lazyBody);
        if(task!==null && children[0]?.type==='paragraph') children[0].text=children[0].text.replace(/^\[[ xX]\][ \t]*/, '');
        if(children.some((t,index)=>index>0&&t.gap)) loose=true;
        items.push({children,task,trailBlank});j=k;
      }
      if(loose) for(let z=0;z<items.length-1;z++) {const item=items[z],last=item.children.at(-1);if(item.trailBlank && last?.type==='html' && !last.text.endsWith('\n')) last.text+='\n';}
      emit({type:'list',ordered,start:ordered?parseInt(m[2]):1,loose,items});
      if(j>i && blank(lines[j-1])) gap=true;
      i=j;continue;
    }
    const table=tableStart(lines,i);
    if(table) {
      let j=i+2;const rows=[];
      while(j<lines.length && lines[j]!=='' && !/^ +$/.test(lines[j]) && (indent(lines[j])[0]<4 || blank(lines[j])) && (!interrupts(lines[j]) || blank(lines[j])&&rows.length>0)) {rows.push(cells(lines[j]));j++;}
      emit({type:'table',...table,rows});i=j;continue;
    }
    // A paragraph may contain several physical lines. Setext underlines take
    // precedence over the thematic break that would otherwise interrupt it.
    let j=i+1,text=s;
    let setext=0;
    while(j<lines.length && (!blank(lines[j]) || j===lines.length-1 && lines[j]!=='')) {
      if(/^ {0,3}(?:=+|-+)[ \t]*$/.test(lines[j])) {setext=lines[j].trim()[0]==='='?1:2;j++;break;}
      if(!lazy.has(j) && !(j===lines.length-1 && blank(lines[j]) && lines[j]!=='') && (interrupts(lines[j]) || !paragraphTop&&bullet(lines[j]) || tableStart(lines,j))) break;
      if(!paragraphTop && indent(lines[j])[0]>=4 && !lazy.has(j)) {
        const code=[];let k=j,last=j;
        while(k<lines.length && (indent(lines[k])[0]>=4 || blank(lines[k]))) {code.push(indent(lines[k])[0]>=4?strip(lines[k],4):'');if(!blank(lines[k])) last=k+1;k++;}
        text+='\n'+code.slice(0,last-j).join('\n');j=last;
        if(j<lines.length && !blank(lines[j]) && !interrupts(lines[j]) && !bullet(lines[j])) text+='\n';
        continue;
      }
      text+='\n'+lines[j];j++;
    }
    emit(setext?{type:'heading',level:setext,text:text.trim()}:{type:'paragraph',text:text});i=j;
  }
  return out;
}
const inlineHTML = /^(?:<!--(?:>|->|[\s\S]*?(?:-->|$))|<\?[\s\S]*?\?>|<![A-Z][\s\S]*?>|<!\[CDATA\[[\s\S]*?\]\]>|<\/[A-Za-z][A-Za-z\d-]*\s*>|<[A-Za-z][A-Za-z\d-]*(?:\s+[A-Za-z_:][\w:.-]*(?:\s*=\s*(?:[^\s"'=<>`]+|'[^']*'|"[^"]*"))?)*\s*\/?>)/;
const emailRE = /^[A-Za-z\d.!#$%&'*+\/=?^_`{|}~-]+@[A-Za-z\d](?:[A-Za-z\d-]*[A-Za-z\d])?(?:\.[A-Za-z\d](?:[A-Za-z\d-]*[A-Za-z\d])?)+/;
const angleEmail = /^[A-Za-z\d.!#$%&'*+\/=?^_`{|}~-]+@[A-Za-z\d](?:[A-Za-z\d-]*[A-Za-z\d])?(?:\.[A-Za-z\d](?:[A-Za-z\d-]*[A-Za-z\d])?)*$/;
function codeSpan(s,p) {
  let n=1;while(s[p+n]==='`') n++;
  let j=p+n;
  while(j<s.length) {
    j=s.indexOf('`',j);if(j<0) return null;
    let k=j;while(s[k]==='`') k++;
    if(k-j===n) {
      let text=s.slice(p+n,j).replace(/\n/g,' ');
      if(text[0]===' ' && text.endsWith(' ') && /[^ ]/.test(text)) text=text.slice(1,-1);
      return {text,end:k};
    }
    j=k;
  }
  return null;
}
function bracketEnd(s,p) {
  let depth=1,literalTicks=false;
  for(let j=p+1;j<s.length;j++) {
    if(s[j]==='\\') {j++;continue;}
    if(s[j]==='`') {let run=1;while(s[j+run]==='`')run++;const c=literalTicks?null:codeSpan(s,j);if(c && (run===1 || !/\](?:\(|\[)/.test(s.slice(j,c.end)) || !c.text.includes('`'))) {j=c.end-1;continue;}if(run>1) literalTicks=true;j+=run-1;continue;}
    if(s[j]==='<') {const h=inlineHTML.exec(s.slice(j));const auto=/^<[^<>\n]*>/.exec(s.slice(j));if(h||auto) {j+=(h||auto)[0].length-1;continue;}}
    if(s[j]==='[') depth++;
    if(s[j]===']' && --depth===0) return j;
  }
  return -1;
}
function linkAt(s,p,refs,permissive=false) {
  const image=s[p]==='!',start=image?p+1:p;
  const end=bracketEnd(s,start);if(end<0) return null;
  const text=s.slice(start+1,end);
  if(text.includes('`')) for(let k=0;k<text.length;k++) if(text[k]==='`') {const code=codeSpan(text,k);if(code) {let n=1;while(text[k+n]==='`') n++;if(!permissive && code.text.includes('`') && text.slice(code.end).trim()) return null;k=code.end-1;}else {while(text[k+1]==='`') k++;}}
  let pos=end+1, url,title='';
  if(s[pos]==='(') {
    pos++;
    pos+=/^\s*/.exec(s.slice(pos))[0].length;
    const d=destination(s,pos);
    if(d) {
      pos=d.end;url=d.url;
      const ws=/^\s*/.exec(s.slice(pos))[0];pos+=ws.length;
      if(ws && s[pos]!==')') {
        const t=titleAt(s,pos);
        if(t && !/\n[ \t]*\n/.test(t.title)) {title=t.title;pos=t.end;pos+=/^\s*/.exec(s.slice(pos))[0].length;}
        else url=undefined;
      }
      if(s[pos]!==')') url=undefined;
      else pos++;
    }
    if(url!==undefined) return {image,text,url:unescape(url),title:unescape(title),end:pos,inline:true};
  }
  pos=end+1;
  let key=text;
  if(s[pos]==='[') {
    const r=/^\[((?:\\.|[^\[\]\\])*)\]/.exec(s.slice(pos));
    if(r) {key=r[1]||text;pos+=r[0].length;}
  }
  const ref=refs.get(label(key));
  return ref?{image,text,url:ref.url,title:ref.title,end:pos}:null;
}
function trimURL(s) {
 let previous;
 do {
  previous=s;
  s=s.replace(/&[A-Za-z0-9]+;$/,'').replace(/[?!.,:;*_~]+$/,'');
  const opens=[],unmatched=[];
  for(let i=0;i<s.length;i++) {if(s[i]==='(') opens.push(i);else if(s[i]===')') {if(opens.length) opens.pop();else unmatched.push(i);}}
  if(opens.length) s=s.slice(0,opens[0]);
  else if(unmatched.at(-1)===s.length-1) s=s.slice(0,-1);
 }while(s!==previous);
 return s;
}
const plainBoundary=/[\\`\[<*_~&"'>]|!(?=\[)/g;
const automaticCandidate=/(?:https?:\/\/|ftp:\/\/|www\.)[^\s<]+|(?<![A-Za-z\d.!#$%&'*+\/=?^_`{|}~-])(?:mailto:|xmpp:)?[A-Za-z\d.!#$%&'*+\/=?^_`{|}~-]+@[A-Za-z\d](?:[A-Za-z\d-]*[A-Za-z\d])?(?:\.[A-Za-z\d](?:[A-Za-z\d-]*[A-Za-z\d])?)+/gi;
const urlCandidate=/(?:https?:\/\/|ftp:\/\/|www\.)[^\s<]+/gi;
const inlineSyntax=/[\\`\[<*_~&"'>]|!(?=\[)/;
function inline(s,refs,inLink=null,raw=false,plain=false) {
  const hasEmail=s.includes('@'),hasURL=s.includes('://')||s.includes('www.');
  if(!inlineSyntax.test(s) && !(hasEmail&&/(?:mailto|xmpp):/i.test(s))) {
    const linked=inLink===null?!!refs.inLink:inLink;
    refs.lastInlineLink=linked;
    if(!hasEmail&&!hasURL || linked) return s.replace(/ {2,}\n[ \t]*/g,'<br>');
    return plainLinks(s,hasEmail).replace(/ {2,}\n[ \t]*/g,'<br>');
  }
  const candidateRE=hasEmail?automaticCandidate:urlCandidate;
  let masked;
  let protectedEnd=0,autoMatch=null,autoDone=false;
  function nextAutomatic(p) {
    if(autoDone || !hasEmail&&!hasURL) return s.length;
    if(!autoMatch || autoMatch.index<p) {candidateRE.lastIndex=p;autoMatch=candidateRE.exec(s);if(!autoMatch) {autoDone=true;return s.length;}}
    return autoMatch.index;
  }
  let rawMode=raw, htmlLink=inLink===null?!!refs.inLink:inLink;
  let html='';
  function add(text) {html+=text;}
  for(let p=0;p<s.length;) {
    const c=s[p];let m;
    if(c==='\\') {
      if(s[p+1]==='\n') {add('<br>');p+=2;while(s[p]===' '||s[p]==='\t') p++;continue;}
      if(s[p+1] && /[!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~]/.test(s[p+1])) {add(escape(s[p+1],true));p+=2;continue;}
    }
    if(c==='`') {
      const code=codeSpan(s,p);
      if(code) {add('<code>'+escape(code.text,true)+'</code>');p=code.end;continue;}
      let j=p+1;while(s[j]==='`') j++;add(s.slice(p,j));p=j;continue;
    }
    if(c==='!' && s[p+1]==='[' || c==='[') {
      const l=linkAt(s,p,refs);
      if(!l) {const mask=linkAt(s,p,refs,true);if(mask) protectedEnd=Math.max(protectedEnd,mask.end);}
      if(l) {
        // Inline links in the label deactivate an enclosing link. Autolinks,
        // on the other hand, are disabled while rendering a link label.
        const nested=!l.image && /\[/.test(l.text) && hasLink(l.text,refs);
        if(!nested) {
          const child=l.image?'':inline(l.text,refs,true,rawMode,plain);
          const u=href(l.url);
          if(u!==null) {
            if(plain) {add(l.image?plainInline(l.text,refs):child);}
            else if(l.image) {
              const alt=plainInline(l.text,refs);
              add('<img src="'+escape(u)+'" alt="'+alt+'"'+(l.title?' title="'+escape(l.title)+'"':'')+'>');
            } else add('<a href="'+escape(u)+'"'+(l.title?' title="'+escape(l.title)+'"':'')+'>'+child+'</a>');
            p=l.end;continue;
          }
        }
      }
    }
    if(c==='<') {
      const close=s.indexOf('>',p+1);
      if(close>=0) {
        const inside=s.slice(p+1,close);
        if(/^[A-Za-z][A-Za-z\d+.-]{1,31}:[^ <>\x00-\x20]*$/.test(inside) || angleEmail.test(inside)) {
          const mail=angleEmail.test(inside), u=href((mail?'mailto:':'')+inside);
          if(u!==null) {add('<a href="'+escape(u,true)+'">'+escape(inside,true)+'</a>');p=close+1;continue;}
        }
      }
      m=inlineHTML.exec(s.slice(p));
      if(m) {
        const tag=m[0];
        if(/^<a\s/i.test(tag)) htmlLink=true;
        else if(/^<\/a\s*>/i.test(tag)) htmlLink=false;
        if(/^<(?:pre|code|kbd|script)(?:\s|>)/i.test(tag)) rawMode=true;
        else if(/^<\/(?:pre|code|kbd|script)\s*>/i.test(tag)) rawMode=false;
        add(plain?escape(tag):tag);p+=tag.length;continue;
      }
    }
    if(!htmlLink && /[mx]/i.test(c)) {
      const mail=/^(mailto:|xmpp:)([A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?)(?:\/[A-Za-z0-9@._-]+)?/.exec(s.slice(p));
      if(mail && !/[-_]/.test(s[p+mail[0].length]||' ')) {let u=trimURL(mail[0]);add('<a href="'+escape(u)+'">'+escape(u)+'</a>');p+=u.length;continue;}
    }
    if(!htmlLink && /[hfwmx]/i.test(c)) {
      m=/^(?:(?:[hH][tT][tT][pP][sS]?|[fF][tT][pP]):\/\/|www\.)(?:[^\s<]+)/.exec(s.slice(p));
      if(m) {
        const u=trimURL(m[0]);
        if(u.length>(m[0].startsWith('www.')?4:m[0].indexOf('://')+3)) {add('<a href="'+escape(href(u.startsWith('www.')?'http://'+u:u)||u)+'">'+escape(u)+'</a>');p+=u.length;continue;}
      }
    }
    if(hasEmail && !htmlLink && /[A-Za-z\d.!#$%&'*+\/=?^_`{|}~-]/.test(c) && (p===0 || !/[\w.+-]/.test(s[p-1]))) {
      m=emailRE.exec(s.slice(p));
      if(m && !/[-_]/.test(s[p+m[0].length]||' ')) {add('<a href="mailto:'+escape(m[0])+'">'+escape(m[0])+'</a>');p+=m[0].length;continue;}
    }
    if(c==='*'||c==='_') {
      const em=p<protectedEnd?null:emphasisAt(s,p,refs,masked??=emphasisMask(s,refs));
      if(em?.literal) {add(c.repeat(em.literal));p+=em.literal;continue;}
      if(em) {const tag=em.take===2?'strong':'em';const content=inline(s.slice(p+em.take,em.end-em.take),refs,htmlLink,rawMode,plain);htmlLink=refs.lastInlineLink;add((plain?'':'<'+tag+'>')+content+(plain?'':'</'+tag+'>'));p=em.end;continue;}
      let n=1;while(s[p+n]===c)n++;
      const count=opening(s,p,n,c)?1:n;add(c.repeat(count));p+=count;continue;
    }
    if(c==='~') {
      const del=deletionAt(s,p,refs);
      if(del) {const content=inline(s.slice(p+del.width,del.end-del.width),refs,htmlLink,rawMode,plain);htmlLink=refs.lastInlineLink;add((plain?'':'<del>')+content+(plain?'':'</del>'));p=del.end;continue;}
      let j=p+1;while(s[j]==='~')j++;add(s.slice(p,j));p=j;continue;
    }
    if(c==='\n') {add('\n');p++;continue;}
    if(c===' ' || c==='\t') {
      let j=p;while(s[j]===' '||s[j]==='\t') j++;
      if(s[j]==='\n' && /^ {2,}$/.test(s.slice(p,j))) {add('<br>');p=j+1;while(s[p]===' '||s[p]==='\t') p++;continue;}
            add(s.slice(p,j));p=j;continue;
    }
    if(c==='&') {
      m=/^&(?:#\d{1,7}|#[xX][\da-fA-F]{1,6}|[A-Za-z][A-Za-z0-9]*);/.exec(s.slice(p));
      if(m) {add(decodeNumeric(m[0]));p+=m[0].length;continue;}
      add('&amp;');p++;continue;
    }
    // Copy prose in whole spans, stopping before syntax or an autolink.
    plainBoundary.lastIndex=p+1;
    const boundary=plainBoundary.exec(s);
    let j=boundary?boundary.index:s.length;
    if(!htmlLink) {
      let next=nextAutomatic(p);
      if(next===p) next=nextAutomatic(p+1);
      if(next>p && next<j) j=next;
    }
    const text=rawMode?s.slice(p,j):escape(s.slice(p,j));
    add(text.replace(/ {2,}\n[ \t]*/g,'<br>'));p=j;
  }
  refs.lastInlineLink=htmlLink;
  if(inLink===null) refs.inLink=htmlLink;
  return plain?html.replace(/<\/?(?:em|strong|del|code)>/g,''):html;
}
function render(tokens,refs,tight=false) {
  let html='';
  for(const t of tokens) {
    switch(t.type) {
      case 'paragraph': html+=tight?inline(t.text,refs):'<p>'+inline(t.text,refs)+'</p>\n';break;
      case 'heading': html+='<h'+t.level+'>'+inline(t.text,refs)+'</h'+t.level+'>\n';break;
      case 'hr':html+='<hr>\n';break;
      case 'html':html+=t.text;break;
      case 'code':html+='<pre><code'+(t.lang?' class="language-'+escape(t.lang.split(/\s+/)[0])+'"':'')+'>'+escape(t.text.replace(/\n$/,''),true)+(t.text?'\n':'')+'</code></pre>\n';break;
      case 'quote':html+='<blockquote>\n'+render(t.children,refs)+'</blockquote>\n';break;
      case 'list': {
        const tag=t.ordered?'ol':'ul';
        html+='<'+tag+(t.ordered&&t.start!==1?' start="'+t.start+'"':'')+'>\n';
        for(const item of t.items) {
          let content=render(item.children,refs,!t.loose);
          if(item.task!==null) {
            const checkbox='<input '+(item.task?'checked="" ':'')+'disabled="" type="checkbox"> ';
            content=t.loose&&content.startsWith('<p>')?'<p>'+checkbox+content.slice(3):checkbox+content;
          }
          html+='<li>'+content+'</li>\n';
        }
        html+='</'+tag+'>\n';break;
      }
      case 'table': {
        html+='<table>\n<thead>\n<tr>\n';
        for(let i=0;i<t.head.length;i++) html+='<th'+(t.align[i]?' align="'+t.align[i]+'"':'')+'>'+inline(t.head[i],refs)+'</th>\n';
        html+='</tr>\n</thead>\n';
        if(t.rows.length) {
          html+='<tbody>';
          for(const row of t.rows) {
            html+='<tr>\n';
            for(let i=0;i<t.head.length;i++) html+='<td'+(t.align[i]?' align="'+t.align[i]+'"':'')+'>'+inline(row[i]||'',refs)+'</td>\n';
            html+='</tr>\n';
          }
          html+='</tbody>';
        }
        html+='</table>\n';break;
      }
    }
  }
  return html;
}
export function parse(markdown) {
  const refs=new Map();
  const text=markdown.replace(/\r\n?/g,'\n');
  return render(blocks(text.split('\n'),refs),refs);
}

function decodeNumeric(s) {
  if(s[1]!=='#') return s;
  const n=/^&#[xX]/.test(s)?parseInt(s.slice(3),16):parseInt(s.slice(2),10);
  const c=n===0 || n>0x10ffff || n>=0xd800&&n<=0xdfff ? '\ufffd':String.fromCodePoint(n);
  return escape(c,true);
}
function hasLink(s,refs) {
  for(let i=0;i<s.length;i++) {
    if(s[i]==='\\') {i++;continue;}
    if(s[i]==='`') {const c=codeSpan(s,i);if(c) {i=c.end-1;continue;}}
    if(s[i]==='!'&&s[i+1]==='[') {const l=linkAt(s,i,refs);if(l) {i=l.end-1;continue;}}
    if(s[i]==='[' && linkAt(s,i,refs)) return true;
  }
  return false;
}
function plainInline(s,refs) {return inline(s,refs,true,false,true);}

function lazyAllowed(tokens) {
 const t=tokens.at(-1);if(!t) return false;
 if(t.type==='paragraph') return true;
 if(t.type==='quote') return lazyAllowed(t.children);
 if(t.type==='list') return lazyAllowed(t.items.at(-1).children);
 return false;
}

function flanking(s,p,n,ch) {
 const a=p?s[p-1]:'',b=s[p+n]||'';
 const aw=!a||/\s/u.test(a),bw=!b||/\s/u.test(b);
 const ap=!!a&&punctuation.test(a)&&(ch!=='*'||a!=='~'),bp=!!b&&punctuation.test(b)&&(ch!=='*'||b!=='~');
 const left=!bw&&(!bp||aw||ap),right=!aw&&(!ap||bw||bp);
 return ch==='_' ? {open:left&&(!right||ap),close:right&&(!left||bp)} : {open:left,close:right};
}
function emphasisAt(source,p,refs,masked=source) {
 const s=masked,ch=source[p];
 let n=1;while(source[p+n]===ch)n++;
 if(!opening(source,p,n,ch)) return null;
 let total=n,mid=0,blocked=false;
 for(let j=p+n;j<s.length;) {
  if(s[j]==='\\') {j+=2;continue;}
  if(s[j]==='`') {const code=codeSpan(s,j);if(code) {j=code.end;continue;}while(s[j]==='`')j++;continue;}
  if(s[j]==='[' || s[j]==='!'&&s[j+1]==='[') {const l=linkAt(source,j,refs);if(l) {j=l.end;continue;}}
  if(s[j]==='<') {const h=inlineHTML.exec(s.slice(j))||/^<[^<>\n]*>/.exec(s.slice(j));if(h) {j+=h[0].length;continue;}}
  if((s[j]==='*'||s[j]==='_') && s[j]!==ch) {const nested=emphasisAt(s,j,refs);if(nested && !nested.literal) {let crossing=false;for(let v=j+1;v<nested.end;) {if(s[v]===ch) {let w=v+1;while(s[w]===ch)w++;if(flanking(s,v,w-v,ch).close) {crossing=true;break;}v=w;}else v++;}if(!crossing) {j=nested.end;continue;}}const other=s[j];while(s[j]===other)j++;continue;}
  if(s[j]!==ch) {j++;continue;}
  let k=j+1;while(s[k]===ch)k++;
  const run=k-j,f=flanking(s,j,run,ch);
  if(!f.close) {if(f.open)total+=run;j=k;continue;}
  if(f.open && n%3!==0 && (n+run)%3===0) {mid+=run;blocked=true;j=k;continue;}
  total-=run;
  if(total>0) {j=k;continue;}
  const right=Math.min(run,run+total+mid);
  const take=Math.min(n,right)%2?1:2;
  return {take,end:j+right};
 }
 return blocked&&n>1?{literal:n}:null;
}

function emphasisMask(s,refs) {
 if(!s.includes('`')) return s;
 if(s.includes('][')) {
  let parts='',last=0;
  for(let p=0;p<s.length;p++) {
   if(s[p]==='\\') {p++;continue;}
   if(s[p]!=='[') continue;
   const link=linkAt(s,p,refs);
   if(link && !link.inline && !hasLink(link.text,refs)) {parts+=s.slice(last,p)+'!'+'a'.repeat(link.end-p-2)+'!';p=link.end-1;last=link.end;}
  }
  if(last) s=parts+s.slice(last);
 }

 let masked='',last=0;
 for(let i=0;i<s.length;) {
  i=s.indexOf('`',i);if(i<0) break;
  let back=i-1;while(back>=0&&s[back]==='\\')back--;
  if((i-back-1)%2) {i++;continue;}
  const code=codeSpan(s,i);
  if(code) {masked+=s.slice(last,i)+'!'+'a'.repeat(Math.max(0,code.end-i-2))+'!';i=code.end;last=i;}
  else {while(s[i]==='`')i++;}
 }
 return last?masked+s.slice(last):s;
}

function deletionAt(s,p,refs) {
 let n=1;while(s[p+n]==='~')n++;
 if(n>2 || !s[p+n] || !opening(s,p,n,'~')) return null;
 let depth=1;
 for(let j=p+n;j<s.length;) {
  if(s[j]==='\\') {j+=2;continue;}
  if(s[j]==='`') {const code=codeSpan(s,j);if(code) {j=code.end;continue;}while(s[j]==='`')j++;continue;}
  if(s[j]==='[' || s[j]==='!'&&s[j+1]==='[') {const l=linkAt(s,j,refs);if(l) {j=l.end;continue;}}
  if(s[j]!== '~') {j++;continue;}
  let k=j+1;while(s[k]==='~')k++;
  if(k-j===n) {
   const flags=flanking(s,j,k-j,'~'),close=flags.close,open=flags.open;
   if(close) {if(--depth===0)return {width:n,end:k};}
   else if(open)depth++;
  }
  j=k;
 }
 return null;
}

function opening(s,p,n,ch) {
 const a=p?s[p-1]:'',b=s[p+n]||'';
 const aw=!a||/\s/u.test(a),bw=!b||/\s/u.test(b);
 const ap=!!a&&punctuation.test(a)&&!(ch==='*'&&a==='_')&&!(ch==='_'&&a==='*');
 const bp=!!b&&punctuation.test(b);
 const left=!bw&&(!bp||aw||ap),right=!aw&&(!ap||bw||bp);
 return ch==='_'?left&&(!right||ap):left;
}

function plainLinks(s,hasEmail) {
 const re=hasEmail?automaticCandidate:urlCandidate;
 let html='',cursor=0;
 re.lastIndex=0;
 for(let match;(match=re.exec(s));) {
  const original=match[0];let value=original,output=original;
  if(/^(?:https?|ftp):\/\//i.test(value) || value.startsWith('www.')) {
   value=trimURL(value);
   const url=href(value.startsWith('www.')?'http://'+value:value);
   if(url!==null && value.length>(original.startsWith('www.')?4:original.indexOf('://')+3)) output='<a href="'+escape(url)+'">'+value+'</a>'+original.slice(value.length);
  } else if(value.includes('@') && !/[-_]/.test(s[match.index+value.length]||' ')) output='<a href="mailto:'+value+'">'+value+'</a>';
  html+=s.slice(cursor,match.index)+output;cursor=match.index+original.length;
 }
 return html+s.slice(cursor);
}
