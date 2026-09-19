#!/usr/bin/env node
// 运行（在样例项目根 examples/title-search 下）：node src/cli.mjs <查询串>
import { items } from './items.mjs';
import { filterByTitle, formatMatches } from './search.mjs';

const query = process.argv.slice(2).join(' ');
console.log(`条目 ${items.length} 条，查询 ${JSON.stringify(query)}`);
console.log(formatMatches(filterByTitle(items, query)));
