function AG_defineProperty ( path, descriptor, base ) {
    var map = Object.create(null);
    var getKey = function (obj) {
        var res = [];
        for ( var key in map ) {
            if( map[key] === obj ) { res.push(key); }
        }
        return res;
    };
    var override = function (obj, path) {
        var pos = path.indexOf('.');
        var prop = path.slice(0, pos);
        var nextPath = path.slice(pos + 1);
        if ( nextPath.length === 0 ) { return Object.defineProperty(obj, prop, descriptor); }
        return (map[path] = Object.defineProperty(obj, prop, makeAccessor(obj, prop, nextPath)));
    };
    var makeAccessor = function(obj, prop, nextPath) {
        var desc = Object.getOwnPropertyDescriptor(obj, prop);
        if ( desc ) {
            delete desc.configurable;
            delete desc.enumerable;
        }
        return {
            get: function() {
                if ( !desc ) return undefined;
                var val;
                if ( desc.hasOwnProperty('value') ) { val = desc.value; }
                else if ( !desc.get ) { return undefined; }
                else { val = desc.get.call(obj); }
                if ( !(val instanceof Object) ) { return val; }
                var keys = getKey(val);
                if ( keys.indexOf(nextPath) != -1 ) { return val; }
                var l = keys.length;
                var nextProp = nextPath.split('.', 1)[0];
                while( l-- > 0 ) {
                    if ( keys[l].split('.', 1)[0] == nextProp ) {
                        console.warn('AG_defineProperty: unresolvable circular reference detected.');
                        return val;
                    }
                }
                return override(val, nextPath);
            },
            set: function(incoming) {
                if ( !desc ) {
                    desc = { value: incoming, writable: true };
                    return true;
                }
                if ( desc.hasOwnProperty('value') ) {
                    if ( desc.writable ) {
                        desc.value = incoming;
                        return true;
                    }
                    else { return false; }
                }
                if ( !desc.set ) { return false; } // throw in strict mode
                return desc.set.call(obj, incoming);
            }
        };
    };
    path += ".";
    override(base || window, path);
}

this['AG_defineProperty'] = AG_defineProperty;
