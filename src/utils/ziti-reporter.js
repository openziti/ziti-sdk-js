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


class ZitiReporter {
    constructor (options) {
      this.options = Object.assign({}, options)
  
      this.defaultColor = '#7f8c8d' // Gray

      this.levelColorMap = {
        0: '#f60404', // Red      FATAL | ERROR
        1: '#ff5c00', // Orange   WARN
        2: '#ffeb3b', // Yellow   LOG
        3: '#4caf50', // Green    INFO
        4: '#008efe', // Blue     DEBUG
        5: '#04e2fe', // Cyan     TRACE
      }

      this.typeColorMap = {
        success: '#ee0450',    // 
        // success: '#2ecc71'  // Green
      }
    }
  
    log (logObj) {
      const consoleLogFn = logObj.level < 1
        // eslint-disable-next-line no-console
        ? (console.__error || console.error)
        // eslint-disable-next-line no-console
        : logObj.level === 1 && console.warn ? (console.__warn || console.warn) : (console.__log || console.log)
  
      // Type
      const type = logObj.type !== 'log' ? logObj.type : ''
  
      // Tag
      const tag = logObj.tag ? logObj.tag : ''
  
      // Styles
      const color = this.typeColorMap[logObj.type] || this.levelColorMap[logObj.level] || this.defaultColor
      const successStyle = `
        border-radius: 1.5em;
        color: white;
        font-weight: bold;
        padding: 10px 1.5em;
        background-image: linear-gradient(to bottom right, #0e61ed , #ee044f);
      `
      const normalStyle = `
        background: ${color};
        border-radius: 1.5em;
        color: white;
        font-weight: bold;
        padding: 2px 0.5em;
      `

      const style = logObj.type === 'success' ? successStyle : normalStyle
  
      const badge = logObj.type === 'success' ? `%cZiti` : `%cZiti-${[tag, type].filter(Boolean).join(':')}`

      // Log to the console
      if (typeof logObj.args[0] === 'string') {
        consoleLogFn(
          `${badge}%c ${logObj.args[0]}`,
          style,
          // Empty string as style resets to default console style
          '',
          ...logObj.args.slice(1)
        )
      } else {
        consoleLogFn(badge, style, ...logObj.args)
      }
    }
  }
  
/**
 * Expose `ZitiReporter`.
 */

module.exports = ZitiReporter;
