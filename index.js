this['AG_defineProperty'] = (function() {

/******************************************************************************/
var WeakObjMap = typeof WeakMap == 'function' ? WeakMap : (function() {
    /** @constructor */
    function WeakMap() {
        this.ID = Math.random().toString(36).slice(7);
    }
    WeakMap.prototype.get = function(obj) {
        return obj[this.ID];
    };
    WeakMap.prototype.set = function(obj, value) {
        obj[this.ID] = value;
        return this;
    };
    return WeakMap;
})();

function AG_defineProperty ( path, descriptor, base ) {
    var map = new WeakObjMap();
    var override = function (obj, path) {
        if ( !(obj instanceof Object) ) { return obj; } // Primitives shall not be overridden.
        var pos = path.indexOf('.');
        var prop = path.slice(0, pos);
        var nextPath = path.slice(pos + 1);
        // Performs a check of whether it was already overridden
        var keys = map.get(obj);
        if ( keys ) {
            var l = keys.length;
            while ( l-- > 0 ) {
                var key = keys[l];
                if( key == path ) { return obj; }
                if ( key.split('.', 1)[0] == prop ) {
                    console.warn('AG_defineProperty: unresolvable circular reference detected.');
                    return obj;
                }
            }
        }
        // Defines a property {prop} of {obj}
        var desc = Object.getOwnPropertyDescriptor(obj, prop);
        if ( ( !desc && Object.isExtensible(obj) ) || desc.configurable ) {
            if ( nextPath.length === 0 ) { Object.defineProperty(obj, prop, descriptor); }
            else {
                var nextDesc = {
                    get: function() {
                        if ( !desc ) return undefined;
                        var val;
                        if ( desc.hasOwnProperty('value') ) { val = desc.value; }
                        else if ( !desc.get ) { return undefined; }
                        else { val = desc.get.call(obj); }
                        return override(val, nextPath);
                    },
                    set: function(incoming) {
                        if ( !desc ) {
                            desc = {};
                            desc.value = incoming;
                            desc.writable = true;
                            return true;
                        }
                        if ( desc.hasOwnProperty('value') ) {
                            if ( desc.writable ) {
                                desc.value = incoming;
                                return true;
                            }
                            else { return false; }
                        }
                        if ( !desc.set ) { return false; } // Caveat: this actually should throw in strict mode.
                        return desc.set.call(obj, incoming);
                    },
                    enumerable: desc ? desc.enumerable : true
                };
                Object.defineProperty(obj, prop, nextDesc);
            }
        } else if ( desc && desc.writable ) {
            if ( nextPath.length === 0 ) {
                if ( descriptor.writable ) { obj[prop] = descriptor.value; }
                else {
                    console.warn('AG_defineProperty: cannot rewrite property ' + prop + '.');        
                    return obj;
                }
            }
            obj[prop] = override(desc.value, nextPath);
        } else {
            console.warn('AG_defineProperty: cannot redefine property ' + prop + '.');
            return obj;
        }
        // Stores overridden object in the WeakMap instance
        if ( keys ) { keys.push(path); }
        else { map.set(obj, [path]); }
        return obj;
    };
    path += ".";
    override(base || window, path);
}

return AG_defineProperty;
/******************************************************************************/

})();