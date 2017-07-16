function AG_defineProperty ( path, descriptor, base ) {
    var map = Object.create(null);
    var override = function (obj, path) {
        if ( !(obj instanceof Object) ) { return obj; }
        var pos = path.indexOf('.');
        var prop = path.slice(0, pos);
        var nextPath = path.slice(pos + 1);
        for ( var key in map ) {
            if ( map[key] === obj ) {
                if ( key == path ) { return obj; }
                if ( key.split('.', 1)[0] == prop ) {
                    console.warn('AG_defineProperty: unresolvable circular reference detected.');
                    return obj;
                }
            }
        }
        var desc = Object.getOwnPropertyDescriptor(obj, prop);
        if ( ( !desc && Object.isExtensible(obj) ) || desc.configurable ) {
            if ( nextPath.length === 0 ) { return Object.defineProperty(obj, prop, descriptor); }
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
                    if ( !desc.set ) { return false; } // Should throw in strict mode
                    return desc.set.call(obj, incoming);
                },
                enumerable: desc ? desc.enumerable : true
            };
            return (map[path] = Object.defineProperty(obj, prop, nextDesc));
        } else if ( desc && desc.writable ) {
            if ( nextPath.length === 0 ) {
                if ( descriptor.writable ) { obj[prop] = descriptor.value; }
                return obj;
            }
            obj[prop] = override(desc.value, nextPath);
            return (map[path] = obj);
        } else {
            console.warn('AG_defineProperty: cannot redefine property ' + prop);
            return obj;
        }
    };

    path += ".";
    override(base || window, path);
}

this['AG_defineProperty'] = AG_defineProperty;
