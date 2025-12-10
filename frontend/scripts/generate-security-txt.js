#!/usr/bin/env node

import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Calculate expiration date (1 year from now)
const expiresDate = new Date();
expiresDate.setFullYear(expiresDate.getFullYear() + 1);
const expiresISO = expiresDate.toISOString();

const securityTxt = `Contact: mailto:security@stashd.cc
Expires: ${expiresISO}
Preferred-Languages: en, nl
`;

const outputDir = join(__dirname, '..', 'public', '.well-known');
const outputPath = join(outputDir, 'security.txt');

mkdirSync(outputDir, { recursive: true });
writeFileSync(outputPath, securityTxt);

console.log(`Generated security.txt with expiration: ${expiresISO}`);
