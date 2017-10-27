var DEBUG = true;
/****************************************************************************************/
// Originally from https://github.com/Polymer/WeakMap
var wm;
var defineProperty = Object.defineProperty;
if (typeof WeakMap == 'function') {
    wm = WeakMap;
}
else {
    var counter_1 = 0;
    wm = (function () {
        function WM() {
            this.$name = (counter_1 += Math.random()).toString();
        }
        WM.prototype.set = function (key, value) {
            var entry = key[this.$name];
            if (entry && entry[0] === key)
                entry[1] = value;
            else
                defineProperty(key, this.$name, { value: [key, value], writable: true });
            return this;
        };
        WM.prototype.get = function (key) {
            var entry;
            return (entry = key[this.$name]) && entry[0] === key ?
                entry[1] : undefined;
        };
        WM.prototype.delete = function (key) {
            var entry = key[this.$name];
            if (!entry)
                return false;
            var hasValue = entry[0] === key;
            entry[0] = entry[1] = undefined;
            return hasValue;
        };
        WM.prototype.has = function (key) {
            var entry = key[this.$name];
            if (!entry)
                return false;
            return entry[0] === key;
        };
        return WM;
    }());
}
/****************************************************************************************/
// Defining classes as static properties of a class does not work well with tsickle,
// due to its implicit type.
var ObjectState = (function () {
    function ObjectState($raw) {
        this.$raw = $raw;
        this.ownProps = Object.create(null);
    }
    ObjectState.prototype.isConcrete = function () {
        return typeof this.$raw === 'object';
    };
    return ObjectState;
}());
var PropertyState = (function () {
    function PropertyState(owner, prop, obj, providedDesc) {
        this.owner = owner;
        this.prop = prop;
        this.obj = obj;
        this.providedDesc = providedDesc;
    }
    PropertyState.prototype.isConcrete = function () {
        return this.owner.isConcrete();
    };
    return PropertyState;
}());
/****************************************************************************************/
/****************************************************************************************/
var DeepOverrideHost = (function () {
    /****************************************************************************************/
    function DeepOverrideHost() {
        this.objectStateMap = new wm();
    }
    /****************************************************************************************/
    DeepOverrideHost.prototype.cloneObjectState = function (objState) {
        var cloned = new DeepOverrideHost.ObjectState(objState.$raw);
        for (var prop in objState.ownProps) {
            this.clonePropState(objState.ownProps[prop], cloned);
        }
        return cloned;
    };
    DeepOverrideHost.prototype.clonePropState = function (propState, owner) {
        var cloned = new DeepOverrideHost.PropertyState(owner, propState.prop, this.cloneObjectState(propState.obj), this.cloneDesc(propState.providedDesc));
        owner.ownProps[cloned.prop] = cloned;
        if (owner.isConcrete()) {
            var origDesc = DeepOverrideHost.getOwnPropertyDescriptor(owner.$raw, cloned.prop);
            cloned.desc = origDesc;
            var newDesc = cloned.providedDesc || this.descFactory(cloned);
            if (!origDesc || origDesc.configurable) {
                DeepOverrideHost.defineProperty(owner.$raw, cloned.prop, newDesc);
                /**
                 * `AG_defineProperty('a.b', { get(), set() });, window.a = { b: 1 };` should
                 * call the setter with incoming value `1`.
                 */
                if (origDesc && this.isDataDescriptor(origDesc)) {
                    this.invokeSetterRaw(owner.$raw, newDesc, origDesc.value);
                    /**
                     * `var a = {}; window.b = a; AG_defineProperty('b.c', { value: 1})` should
                     * override `a` so that `a.c = 1`.
                     */
                    this.applyObjectStateRaw(origDesc.value, propState.obj);
                }
            }
            else if (origDesc && this.isDataDescriptor(origDesc)) {
                /**
                 * In this case, we do not redefine the current property,
                 * and proceed directly to override the value.
                 */
                this.applyObjectStateRaw(origDesc.value, propState.obj);
            }
            else {
                DeepOverrideHost.warnNonConfigurableProperty(cloned.prop);
            }
        }
        return cloned;
    };
    /****************************************************************************************/
    DeepOverrideHost.prototype.descFactory = function (propState) {
        // ToDo: enumerability fix
        var overrider = this;
        // configurable, enumerable properties will follow that of the original descriptor.
        // See www.ecma-international.org/ecma-262/6.0/#sec-validateandapplypropertydescriptor
        // for the precise logic.
        return {
            get: function () { return overrider.getRaw(propState, this); },
            set: function (incoming) { return overrider.setRaw(propState, incoming, this); },
            enumerable: propState.desc ? propState.desc.enumerable : true
        };
    };
    /****************************************************************************************/
    /**
     * Get operation, X.Y
     * @param propState propState(X.Y)
     */
    DeepOverrideHost.prototype.$get = function (propState, _this) {
        var desc = propState.desc;
        if (!desc) {
            return undefined;
        }
        var val; // A raw object to be returned from the getter.
        if (this.isDataDescriptor(desc)) {
            val = desc.value;
        }
        else if (!desc.get) {
            return undefined;
        }
        else {
            val = desc.get.call(_this);
        }
        this.applyObjectStateRaw(val, propState.obj);
        return val;
    };
    DeepOverrideHost.prototype.getRaw = function (propState, _this) {
        if (_this !== propState.owner.$raw) {
            if (propState.desc && propState.desc.get) {
                return propState.desc.get.call(_this);
            }
            return undefined;
        }
        return this.$get(propState, _this);
    };
    /**
     * Set operation, X.Y = Z
     * @param propState propState(X.Y)
     * @param objState objState(Z)
     */
    DeepOverrideHost.prototype.$set = function (propState, objState, _this) {
        // Quick path for X.Y = X.Y.
        var desc = propState.desc;
        if (desc && this.isDataDescriptor(desc) && desc.value === objState.$raw) {
            return true;
        }
        this.invokeSetter(propState, objState.$raw, _this);
        this.applyObjectState(objState, propState.obj);
    };
    DeepOverrideHost.prototype.setRaw = function (propState, incoming, _this) {
        if (_this !== propState.owner.$raw || typeof incoming !== 'object') {
            return this.invokeSetter(propState, incoming, _this);
        }
        else {
            var objectState = this.getObjectState(incoming);
            return this.$set(propState, objectState, _this);
        }
    };
    /****************************************************************************************/
    /**
     * @param abstractObjectState ***Beware*** This argument should not be mutated.
     * It should be cloned when part of its information need to be transfered to `objState`.
     * @param objState This argument will be mutated.
     */
    DeepOverrideHost.prototype.applyObjectState = function (objState, abstractObjectState) {
        for (var prop in abstractObjectState.ownProps) {
            var readonlyPropState = abstractObjectState.ownProps[prop];
            if (!objState.ownProps[prop]) {
                this.clonePropState(readonlyPropState, objState);
            }
            else {
                this.applyProp(objState.ownProps[prop], readonlyPropState);
            }
        }
    };
    DeepOverrideHost.prototype.applyObjectStateRaw = function (obj, idealObjectState) {
        if (typeof obj !== 'object') {
            return obj;
        }
        var objState = this.getObjectState(obj);
        this.applyObjectState(objState, idealObjectState);
    };
    /**
     * @param abstractPropertyState ***Beware*** This argument should not be mutated.
     */
    DeepOverrideHost.prototype.applyProp = function (propState, abstractPropertyState) {
        if (abstractPropertyState.providedDesc) {
            if (propState.providedDesc) {
                if (this.compareDesc(abstractPropertyState.providedDesc, propState.providedDesc)) {
                    // Intentionally blank
                }
                else {
                    if (propState.isConcrete()) {
                        // already overwritten
                        DeepOverrideHost.warnNonConfigurableProperty(propState.prop);
                    }
                    else {
                        DeepOverrideHost.warnCircularReference(propState.prop);
                    }
                }
            }
            else {
                if (propState.isConcrete()) {
                    if (propState.desc) {
                        // Intentionally blank
                    }
                    else {
                        propState.desc = this.cloneDesc(abstractPropertyState.providedDesc);
                    }
                }
                else {
                    DeepOverrideHost.warnNonConfigurableProperty(propState.prop);
                }
            }
        }
        if (propState.obj && abstractPropertyState.obj) {
            if (propState.obj !== abstractPropertyState.obj) {
                this.applyObjectState(propState.obj, abstractPropertyState.obj);
            }
        }
    };
    /****************************************************************************************/
    DeepOverrideHost.prototype.getPropertyWriteDescriptor = function (value) {
        return {
            value: value,
            configurable: true,
            writable: true,
            enumerable: true
        };
    };
    DeepOverrideHost.prototype.invokeSetterRaw = function (owner, desc, incoming) {
        if (this.isDataDescriptor(desc)) {
            if (desc.writable) {
                desc.value = incoming;
                return true;
            }
            else {
                return false;
            }
        }
        if (!desc.set) {
            return false;
        }
        return desc.set.call(owner, incoming);
    };
    DeepOverrideHost.prototype.invokeSetter = function (propState, incoming, _this) {
        var desc = propState.desc;
        if (!desc) {
            if (!DeepOverrideHost.isExtensible(propState.owner.$raw)) {
                DeepOverrideHost.warnNonExtensibleProperty(propState.prop);
                return false;
            }
            propState.desc = this.getPropertyWriteDescriptor(incoming);
            return true;
        }
        return this.invokeSetterRaw(_this, desc, incoming);
    };
    /****************************************************************************************/
    DeepOverrideHost.prototype.isDataDescriptor = function (desc) {
        return typeof desc.writable !== 'undefined';
    };
    DeepOverrideHost.prototype.cloneDesc = function (desc) {
        if (!desc) {
            return undefined;
        }
        var cloned = {};
        var i = DeepOverrideHost.DESC_KEYS_LENGTH;
        while (i--) {
            var key = DeepOverrideHost.DESC_KEYS[i];
            if (desc.hasOwnProperty(key)) {
                cloned[key] = desc[key];
            }
        }
        return cloned;
    };
    DeepOverrideHost.prototype.compareDesc = function (desc1, desc2) {
        var i = DeepOverrideHost.DESC_KEYS_LENGTH;
        while (i--) {
            var key = DeepOverrideHost.DESC_KEYS[i];
            if (desc1[key] !== desc2[key]) {
                return false;
            }
        }
        return true;
    };
    DeepOverrideHost.warnNonConfigurableProperty = function (prop) {
        DeepOverrideHost.warn("cannot redefine non-configurable property " + prop + ".");
    };
    DeepOverrideHost.warnNonExtensibleProperty = function (prop) {
        DeepOverrideHost.warn("cannot define a property " + prop + " on a non-extensible object.");
    };
    /**
     * Consider setting such properties to be non-writable.
     */
    DeepOverrideHost.warnNonConfigurableWritableProperty = function (prop) {
        DeepOverrideHost.warn("skipped proxying a non-configurable writable property " + prop + ", property may be written again.");
    };
    DeepOverrideHost.warnCircularReference = function (prop) {
        DeepOverrideHost.warn("unresolvable circular referrence with property " + prop + ".");
    };
    DeepOverrideHost.prototype.getObjectState = function (obj) {
        var state = this.objectStateMap.get(obj);
        if (!state) {
            state = new DeepOverrideHost.ObjectState(obj);
            this.objectStateMap.set(obj, state);
        }
        return state;
    };
    DeepOverrideHost.prototype.throwPathError = function () {
        throw DEBUG ? new Error("Malformed path string") : 1;
    };
    DeepOverrideHost.prototype.buildAbstractStateTree = function (path, root) {
        path += '.';
        root = root || new DeepOverrideHost.ObjectState();
        var splitter = this.splitter || (this.splitter = /^([^\\\.]|\\.)*?\./);
        var data = root;
        var match;
        var matchLength;
        var prop;
        var nextData;
        var propData;
        while (path) {
            match = splitter.exec(path);
            if (match === null) {
                return this.throwPathError();
            }
            matchLength = match[0].length;
            prop = path.slice(0, matchLength - 1);
            path = path.slice(matchLength);
            propData = data.ownProps[prop];
            if (!propData) {
                nextData = new DeepOverrideHost.ObjectState();
                propData = new DeepOverrideHost.PropertyState(data, prop, nextData);
                data.ownProps[prop] = propData;
            }
            else {
                nextData = propData.obj;
            }
            data = nextData;
        }
        if (!propData) {
            return this.throwPathError();
        }
        return propData;
    };
    DeepOverrideHost.prototype.addProperty = function (path, descriptor, base) {
        base = base || window;
        var baseState = new DeepOverrideHost.ObjectState();
        var terminalPropState = this.buildAbstractStateTree(path, baseState);
        terminalPropState.providedDesc = descriptor;
        this.applyObjectStateRaw(base, baseState);
    };
    /****************************************************************************************/
    DeepOverrideHost.ObjectState = ObjectState;
    DeepOverrideHost.PropertyState = PropertyState;
    DeepOverrideHost.DESC_KEYS = 'value,get,set,writable,configurable,enumerable'.split(',');
    DeepOverrideHost.DESC_KEYS_LENGTH = 6; /* DeepOverrideHost.DESC_KEYS.length */
    DeepOverrideHost.defineProperty = defineProperty;
    DeepOverrideHost.getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
    DeepOverrideHost.isExtensible = Object.isExtensible;
    /****************************************************************************************/
    DeepOverrideHost.warn = DEBUG && typeof console !== 'undefined' ? function (msg) {
        console.warn("AG_defineProperty: " + msg);
    } : function () { };
    return DeepOverrideHost;
}());
/****************************************************************************************/
/****************************************************************************************/
var overrider;
var AG_defineProperty = function (path, descriptor, base) {
    if (!overrider) {
        overrider = new DeepOverrideHost();
    }
    overrider.addProperty(path, descriptor, base);
};
/****************************************************************************************/
/****************************************************************************************/
/****************************************************************************************/
