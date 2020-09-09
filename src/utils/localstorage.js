  
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
