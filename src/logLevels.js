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

const LogLevel = {}
LogLevel[LogLevel.Fatal = 0] = 'fatal'
LogLevel[LogLevel.Error = 0] = 'error'
LogLevel[LogLevel.Warn = 1] = 'warn'
LogLevel[LogLevel.Log = 2] = 'log'
LogLevel[LogLevel.Info = 3] = 'info'
LogLevel[LogLevel.Success = 3] = 'success'
LogLevel[LogLevel.Ziti = 3] = 'ziti'
LogLevel[LogLevel.Debug = 4] = 'debug'
LogLevel[LogLevel.Trace = 5] = 'trace'
LogLevel[LogLevel.Silent = -Infinity] = 'silent'
LogLevel[LogLevel.Verbose = Infinity] = 'verbose'

module.exports = LogLevel;