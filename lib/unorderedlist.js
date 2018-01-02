/**
 * `UnorderedList` constructor.
 *
 * @api public
 */
class UnorderedList {
  constructor(items) {
    if (typeof items === 'string') {
      items = items.split(' ');
    }

    this._items = items || [];
    this.__defineGetter__('length', this._length);
  }

  /**
   * Check if list is equal to `other` list.
   *
   * @param {UnorderedList} other
   * @return {Boolean}
   * @api public
   */
  equalTo(other) {
    if (!(other instanceof UnorderedList)) {
      other = new UnorderedList(other);
    }

    if (this.length !== other.length) {
      return false;
    }
    for (let i = 0, len = this._items.length; i < len; i++) {
      const item = this._items[i];

      if (other._items.indexOf(item) === -1) {
        return false;
      }
    }
    return true;
  };

  /**
   * Check if list contains `val`
   *
   * @param {String} val
   * @return {Boolean}
   * @api public
   */
  contains(val) {
    return this._items.indexOf(val) !== -1;
  };

  /**
   * Check if list contains any element in `arr`
   *
   * @param {Array} arr
   * @return {Boolean}
   * @api public
   */
  containsAny(arr) {
    for (let i = 0, len = arr.length; i < len; i++) {
      if (this._items.indexOf(arr[i]) !== -1) {
        return true;
      }
    }
    return false;
  };

  /**
   * String representation of list.
   *
   * @return {String}
   * @api private
   */
  toString() {
    return this._items.join(' ');
  };

  /**
   * Length of list.
   *
   * @return {Number}
   * @api private
   */
  _length() {
    return this._items.length;
  };
}

/**
 * Expose `UnorderedList`.
 */
module.exports = UnorderedList;
