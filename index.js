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
        var desc = new Accessor(obj, prop, nextPath);
        return (map[path] = Object.defineProperty(obj, prop, {
            get: desc.get.bind(desc),
            set: desc.set.bind(desc)
        }))
    };
    /** @constructor */
    function Accessor(obj, prop, nextPath) {
        this.obj = obj;
        this.prop = prop;
        this.desc = Object.getOwnPropertyDescriptor(obj, prop);
        this.nextPath = nextPath;
    }

    Accessor.prototype.get = function() {
        if ( !this.desc ) return undefined;
        var val;
        if ( this.desc.hasOwnProperty('value') ) { val = this.desc.value; }
        else if ( !this.desc.get ) { return undefined; }
        else { val = this.desc.get.call(this.obj); }
        if ( !(val instanceof Object) ) { return val; }
        var keys = getKey(val);
        if ( keys.indexOf(this.nextPath) != -1 ) { return val; }
        var l = keys.length;
        var nextProp = this.nextPath.split('.', 1)[0];
        while( l-- > 0 ) {
            if ( keys[l].split('.', 1)[0] == nextProp ) {
                console.warn('AG_defineProperty: unresolvable circular reference detected.');
                return val;
            }
        }
        return override(val, this.nextPath);
    };

    Accessor.prototype.set = function(incoming) {
        if ( !this.desc ) {
            this.desc = {};
            this.desc.value = incoming;
            this.desc.writable = this.desc.configurable = this.desc.enumerable = true;
            return true;
        }
        if ( this.desc.hasOwnProperty('value') ) {
            if ( this.desc.writable ) {
                this.desc.value = incoming;
                return true;
            }
            else { return false; }
        }
        if ( !this.desc.set ) { return false; } // throw in strict mode
        return this.desc.set.call(this.obj, incoming);
    };

    path += ".";
    override(base || window, path);
}

this['AG_defineProperty'] = AG_defineProperty;
