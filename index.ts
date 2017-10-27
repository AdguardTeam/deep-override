let DEBUG = false;

/****************************************************************************************/

type stringmap<T> = {
    [id: string]: T
};

/** Recursively marks properties as readonly. */
type readonly<T> = {
    readonly [P in keyof T]: readonly<T[P]>;
}

/****************************************************************************************/
/****************************************************************************************/

// Workaround for [Symbol.toStringTag] requirement of TS
interface IWeakMap<K extends object, V> {
    delete(key: K): boolean;
    get(key: K): V | undefined;
    has(key: K): boolean;
    set(key: K, value: V): this;
}

interface IWeakMapCtor {
    // In our use-cases, instantiation with entries won't be used.
    new <K extends object, V>(): IWeakMap<K, V>;
    readonly prototype: IWeakMap<object, any>;
}

/****************************************************************************************/

// Originally from https://github.com/Polymer/WeakMap

let wm:IWeakMapCtor;
const defineProperty = Object.defineProperty;

if (typeof WeakMap == 'function') {
    wm = WeakMap;
} else {
    let counter = 0;
    wm = class WM<K, V> {
        private $name:string;
        constructor() {
            this.$name = (counter += Math.random()).toString();
        }
        set(key:K, value:V) {
            let entry = key[this.$name];
            if (entry && entry[0] === key)
                entry[1] = value;
            else
                defineProperty(key, this.$name, {value: [key, value], writable: true});
            return this;
        }
        get(key:K):V {
            let entry;
            return (entry = key[this.$name]) && entry[0] === key ?
                entry[1] : undefined;
        }
        delete(key:K):boolean {
            var entry = key[this.$name];
            if (!entry) return false;
            var hasValue = entry[0] === key;
            entry[0] = entry[1] = undefined;
            return hasValue;
        }
        has(key:K):boolean {
            var entry = key[this.$name];
            if (!entry) return false;
            return entry[0] === key;
        }
    }
}

/****************************************************************************************/
/****************************************************************************************/

/****************************************************************************************

  It is an obligation of each methods to make sure that following preconditions are met:

    1. A concrete object state owns only concrete property state,
      and vice versa for abstract object states.

    2. If a concrete object state owns a property state, a property descriptor should 
      have been defined with either propState's provideDesc or descProxy.

**/

/**
 * Abstract object state does not have `$raw` member.
 */
interface IObjectState {
    ownProps:stringmap<IPropertyState>
    $raw?:object
    isConcrete():boolean
}

/**
 * Abstract property state does not have `desc` member.
 */
interface IPropertyState {
    readonly owner:IObjectState
    readonly prop:string
    readonly obj:IObjectState
    /**
     * Descriptor which the property would have had if it weren't overridden.
     * It will be defined when:
     *  - A property was existing before AG_defineProperty call.
     * will be modified when:
     *  - A property was undefined / was a writable data descriptor and assignment.
     */
    desc?:PropertyDescriptor
    /**
     * Descriptors provided with AG_defineProperty call.
     */
    providedDesc?:PropertyDescriptor
    isConcrete():boolean
}

/****************************************************************************************/

// Defining classes as static properties of a class does not work well with tsickle,
// due to its implicit type.

class ObjectState implements IObjectState {
    public ownProps:stringmap<IPropertyState>
    constructor (public $raw?:object) {
        this.ownProps = Object.create(null);
    }
    isConcrete():boolean {
        return typeof this.$raw === 'object';
    }
}

class PropertyState implements IPropertyState {
    public desc:PropertyDescriptor|undefined
    constructor (
        public readonly owner:IObjectState,
        public readonly prop:string,
        public readonly obj:IObjectState,
        public providedDesc?:PropertyDescriptor
    ) { }
    isConcrete():boolean {
        return this.owner.isConcrete();
    }
}

/****************************************************************************************/
/****************************************************************************************/

class DeepOverrideHost {

/****************************************************************************************/
/****************************************************************************************/    

static readonly ObjectState = ObjectState

static readonly PropertyState = PropertyState

/****************************************************************************************/

cloneObjectState (objState:readonly<IObjectState>):IObjectState {
    let cloned = new DeepOverrideHost.ObjectState(objState.$raw);
    for (let prop in objState.ownProps) {
        this.clonePropState(objState.ownProps[prop], cloned);
    }
    return cloned;
}

clonePropState (propState:readonly<IPropertyState>, owner:IObjectState):IPropertyState {
    let cloned = new DeepOverrideHost.PropertyState(
        owner,
        propState.prop,
        this.cloneObjectState(propState.obj),
        this.cloneDesc(propState.providedDesc)
    );
    
    owner.ownProps[cloned.prop] = cloned;

    if (owner.isConcrete()) {
        let origDesc = DeepOverrideHost.getOwnPropertyDescriptor(owner.$raw, cloned.prop);
        cloned.desc = origDesc;

        let newDesc = cloned.providedDesc || this.descFactory(cloned);

        if (!origDesc || origDesc.configurable) {
            DeepOverrideHost.defineProperty(owner.$raw, cloned.prop, newDesc);
            /**
             * `AG_defineProperty('a.b', { get(), set() });, window.a = { b: 1 };` should
             * call the setter with incoming value `1`.
             */
            if (origDesc && this.isDataDescriptor(origDesc)) {
                this.invokeSetterRaw(owner.$raw!, newDesc, origDesc.value);
                /**
                 * `var a = {}; window.b = a; AG_defineProperty('b.c', { value: 1})` should
                 * override `a` so that `a.c = 1`.
                 */
                this.applyObjectStateRaw(origDesc.value, propState.obj);
            }
        } else if (origDesc && this.isDataDescriptor(origDesc)) {
            /**
             * In this case, we do not redefine the current property,
             * and proceed directly to override the value.
             */
            this.applyObjectStateRaw(origDesc.value, propState.obj);
        } else {
            DeepOverrideHost.warnNonConfigurableProperty(cloned.prop);
        }
    }

    return cloned;
}

/****************************************************************************************/

descFactory (propState:IPropertyState):PropertyDescriptor {
    // ToDo: enumerability fix
    let overrider = this;
    return {
        get: function() { return overrider.getRaw(propState, this); },
        set: function(incoming) { return overrider.setRaw(propState, incoming, this); }
    };
}

/****************************************************************************************/

/**
 * Get operation, X.Y
 * @param propState propState(X.Y)
 */
$get(propState:IPropertyState, _this:any):any {
    let desc = propState.desc;
    if (!desc) { return undefined; }
    let val; // A raw object to be returned from the getter.
    if (this.isDataDescriptor(desc)) { val = desc.value; }
    else if (!desc.get) { return undefined; }
    else { val = desc.get.call(_this); }
    this.applyObjectStateRaw(val, propState.obj);
    return val;
}

getRaw(propState:IPropertyState, _this:any):any {
    if (_this !== propState.owner.$raw) {
        if (propState.desc && propState.desc.get) {
            return propState.desc.get.call(_this);
        }
        return undefined;
    }
    return this.$get(propState, _this);
}

/**
 * Set operation, X.Y = Z
 * @param propState propState(X.Y)
 * @param objState objState(Z)
 */
$set(propState:IPropertyState, objState:IObjectState, _this:any):any {
    // Quick path for X.Y = X.Y.
    let desc = propState.desc;
    if (desc && this.isDataDescriptor(desc) && desc.value === objState.$raw) {
        return true;
    }

    this.invokeSetter(propState, objState.$raw, _this);
    this.applyObjectState(objState, propState.obj);
}

setRaw (propState:IPropertyState, incoming:any, _this:any):any {
    if (_this !== propState.owner.$raw || typeof incoming !== 'object') {
        return this.invokeSetter(propState, incoming, _this);
    } else {
        let objectState = this.getObjectState(incoming);
        return this.$set(propState, objectState, _this);
    }
}

/****************************************************************************************/

/**
 * @param abstractObjectState ***Beware*** This argument should not be mutated.
 * It should be cloned when part of its information need to be transfered to `objState`.
 * @param objState This argument will be mutated.
 */
applyObjectState (objState:IObjectState, abstractObjectState:readonly<IObjectState>):void {
    for (let prop in abstractObjectState.ownProps) {
        let readonlyPropState = abstractObjectState.ownProps[prop];
        if (!objState.ownProps[prop]) {
            this.clonePropState(readonlyPropState, objState);
        } else {
            this.applyProp(objState.ownProps[prop], readonlyPropState);
        }
    }
}

applyObjectStateRaw (obj, idealObjectState:readonly<IObjectState>) {
    if (typeof obj !== 'object') { return obj; }
    let objState = this.getObjectState(obj);
    this.applyObjectState(objState, idealObjectState);
}

/**
 * @param abstractPropertyState ***Beware*** This argument should not be mutated.
 */
applyProp (propState:IPropertyState, abstractPropertyState:readonly<IPropertyState>):void {
    if (abstractPropertyState.providedDesc) {
        if (propState.providedDesc) {
            if (this.compareDesc(<PropertyDescriptor>abstractPropertyState.providedDesc, propState.providedDesc)) {
                // Intentionally blank
            } else {
                if (propState.isConcrete()) {
                    // already overwritten
                    DeepOverrideHost.warnNonConfigurableProperty(propState.prop);
                } else {
                    DeepOverrideHost.warnCircularReference(propState.prop);
                }
            }
        } else {
            if (propState.isConcrete()) {
                if (propState.desc) {
                    // Intentionally blank
                } else {
                    propState.desc = this.cloneDesc(abstractPropertyState.providedDesc);
                }
            } else {
                DeepOverrideHost.warnNonConfigurableProperty(propState.prop);
            }
        }
    }

    if (propState.obj && abstractPropertyState.obj) {
        if (propState.obj !== abstractPropertyState.obj) {
            this.applyObjectState(propState.obj, abstractPropertyState.obj);
        }
    }
}

/****************************************************************************************/

getPropertyWriteDescriptor(value:any):PropertyDescriptor {
    return {
        value: value,
        configurable: true,
        writable: true,
        enumerable: true
    };
} 

invokeSetterRaw(owner:object, desc:PropertyDescriptor, incoming:any):any {
    if (this.isDataDescriptor(desc)) {
        if (desc.writable) {
            desc.value = incoming;
            return true;
        } else {
            return false;
        }
    }
    if (!desc.set) { return false; }
    return desc.set.call(owner, incoming);
}

invokeSetter (propState:IPropertyState, incoming, _this):boolean {
    let desc = propState.desc;
    if (!desc) {
        if (!DeepOverrideHost.isExtensible(propState.owner.$raw)) {
            DeepOverrideHost.warnNonExtensibleProperty(propState.prop);
            return false;
        }
        propState.desc = this.getPropertyWriteDescriptor(incoming);
        return true;
    }
    return this.invokeSetterRaw(_this, desc, incoming);
}

/****************************************************************************************/
    
isDataDescriptor(desc:PropertyDescriptor):boolean {
    return typeof desc.writable !== 'undefined'
}

static readonly DESC_KEYS = 'value,get,set,writable,configurable,enumerable'.split(',');
static readonly DESC_KEYS_LENGTH = 6; /* DeepOverrideHost.DESC_KEYS.length */

cloneDesc(desc:readonly<PropertyDescriptor>|undefined):PropertyDescriptor|undefined {
    if (!desc) {return undefined; }
    let cloned = {};
    let i = DeepOverrideHost.DESC_KEYS_LENGTH;
    while (i--) {
        let key = DeepOverrideHost.DESC_KEYS[i];
        if (desc.hasOwnProperty(key)){
            cloned[key] = desc[key];
        }
    }
    return cloned;
}

compareDesc(desc1:PropertyDescriptor, desc2:PropertyDescriptor):boolean {
    let i = DeepOverrideHost.DESC_KEYS_LENGTH;
    while (i--) {
        let key = DeepOverrideHost.DESC_KEYS[i];
        if (desc1[key] !== desc2[key]) { return false; }
    }
    return true;
}

static defineProperty = defineProperty;
static getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
static isExtensible = Object.isExtensible;

/****************************************************************************************/

static warn:(msg:string)=>void = DEBUG && typeof console !== 'undefined' ? (msg:string):void => {
    console.warn(`AG_defineProperty: ${msg}`);
} : () => {}

static warnNonConfigurableProperty(prop:string):void {
    DeepOverrideHost.warn(`cannot redefine non-configurable property ${prop}.`);
}

static warnNonExtensibleProperty(prop:string):void {
    DeepOverrideHost.warn(`cannot define a property ${prop} on a non-extensible object.`);
}

/**
 * Consider setting such properties to be non-writable.
 */
static warnNonConfigurableWritableProperty(prop:string):void {
    DeepOverrideHost.warn(`skipped proxying a non-configurable writable property ${prop}, property may be written again.`)
}

static warnCircularReference(prop:string):void {
    DeepOverrideHost.warn(`unresolvable circular referrence with property ${prop}.`);
}

/****************************************************************************************/

private objectStateMap:IWeakMap<object, IObjectState>

getObjectState(obj:object):IObjectState {
    let state = this.objectStateMap.get(obj);
    if (!state) {
        state = new DeepOverrideHost.ObjectState(obj);
        this.objectStateMap.set(obj, state);
    }
    return state;
}

/****************************************************************************************/

constructor() {
    this.objectStateMap = new wm<object, IObjectState>();
}

/****************************************************************************************/

private splitter:RegExp;

throwPathError():never {
    throw DEBUG ? new Error("Malformed path string") : 1;
}

buildAbstractStateTree(path:string, root?:IObjectState):IPropertyState {
    path += '.';
    root = root || new DeepOverrideHost.ObjectState();
    let splitter = this.splitter || (this.splitter = /^([^\\\.]|\\.)*?\./);

    let data:IObjectState = root;
    let match:RegExpMatchArray|null;
    let matchLength:number;
    let prop:string;
    let nextData:IObjectState;
    let propData:IPropertyState|undefined;
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
        } else {
            nextData = propData.obj;
        }
        data = nextData;
    }
    if (!propData) { return this.throwPathError(); }
    return propData!;
}

addProperty(path:string, descriptor:PropertyDescriptor, base?:object) {
    base = base || window;

    let baseState = new DeepOverrideHost.ObjectState();
    let terminalPropState = this.buildAbstractStateTree(path, baseState);
    terminalPropState.providedDesc = descriptor;

    this.applyObjectStateRaw(base, baseState);
}


/****************************************************************************************/
/****************************************************************************************/

}

/****************************************************************************************/
/****************************************************************************************/

let overrider:DeepOverrideHost;

declare var _return;

_return = (path:string, descriptor:PropertyDescriptor, base?:object):void => {
    if (!overrider) { overrider = new DeepOverrideHost(); }
    overrider.addProperty(path, descriptor, base);
}

/****************************************************************************************/
/****************************************************************************************/
/****************************************************************************************/
