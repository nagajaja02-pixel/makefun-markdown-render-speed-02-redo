import * as fs from 'node:fs';
import { parse } from './parse.js';

const inputPath = `${process.env.MAKEFUN_INPUT_DIR || '/input'}/cases.json`;
const outputPath = `${process.env.MAKEFUN_OUTPUT_DIR || '/output'}/html.json`;
const documents = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const rendered = documents.map((document: { markdown: string }) => parse(document.markdown));
fs.writeFileSync(outputPath, JSON.stringify(rendered));
