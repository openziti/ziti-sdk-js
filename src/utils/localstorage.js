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

  
/**
 *	Save specified value under specified key
 *	as well as the time when it's supposed to lazily expire
 *
 * @param {Object} key
 * @param {Object} value
 * @param {Object} ttl
 */  
exports.setWithExpiry = (key, value, ttl) => {
	const item = {
	    value: value,
		expiry: ttl,
	}
	localStorage.setItem(key, JSON.stringify(item))
}

/**
 *	Return value for specified key
 *	or null if not found, or expired.
 *
 * @param {Object} key
 * @return {Object} value
 */  
exports.getWithExpiry = (key) => {
	const itemStr = localStorage.getItem(key)
	// if the item doesn't exist, return null
	if (!itemStr) {
		return null
	}
	const item = JSON.parse(itemStr)
	const now = new Date()
	// compare the expiry time of the item with the current time
	if (now.getTime() > item.expiry) {
		// If the item is expired, delete the item from storage and return null
		localStorage.removeItem(key)
		return null
	}
	return item.value
}
