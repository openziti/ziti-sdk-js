/*
Copyright 2019-2020 Netfoundry, Inc.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

https://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

'use strict';


let nowCache;
let utcCache;

function nowDate() {
  if (!nowCache) cache();
  return nowCache;
}

function utcDate() {
  if (!utcCache) cache();
  return utcCache;
}

function cache() {
  const d = new Date();
  nowCache = d.valueOf();
  utcCache = d.toUTCString();
}

function resetCache() {
  nowCache = undefined;
  utcCache = undefined;
}

// class HttpRequestTiming extends PerformanceEntry {
//   constructor(statistics) {
//     super();
//     this.name = 'HttpRequest';
//     this.entryType = 'http';
//     const startTime = statistics.startTime;
//     const diff = process.hrtime(startTime);
//     this.duration = diff[0] * 1000 + diff[1] / 1e6;
//     this.startTime = startTime[0] * 1000 + startTime[1] / 1e6;
//   }
// }

function emitStatistics(statistics) {
  // notify('http', new HttpRequestTiming(statistics));
}

module.exports = {
  kOutHeaders: Symbol('kOutHeaders'),
  kNeedDrain: Symbol('kNeedDrain'),
  nowDate,
  utcDate,
  emitStatistics
};
