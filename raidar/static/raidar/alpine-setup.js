"use strict";

// Alpine.js support for the site's templates (raidar/templates/raidar/*.html).
//
// The templates were written for Ractive, whose expressions are forgiving: a name that is not set, or a property of
// something undefined, reads as undefined instead of throwing, and a block can switch the context its names are read
// from ({{#with}}). Many expressions rely on that (stats an encounter may lack, data still loading), so this keeps
// those rules on top of Alpine:
//
// - read-only expressions (x-text, x-html, x-show, x-if, x-for, x-bind and x-with) read missing properties as
//   undefined, and an expression that throws gives undefined (lenientExpression);
// - names that nothing defines read as undefined, not as browser globals such as `self` or `name` (rootScope);
// - x-with="expr" makes the properties of an object readable by name inside the element, as Ractive's {{#with}}
//   did; x-with:<any>="..." adds more on the same element, each seeing the ones before it;
// - x-select-model="key.path" binds a <select> whose options carry JSON values (null, numbers, strings), which
//   x-model would turn into strings;
// - <template> inside <svg> is parsed as an SVG element, which x-if and x-for cannot use; prepareTemplate turns
//   those into real templates.
//
// Event handlers (x-on) and x-model are left as Alpine evaluates them, so mistakes there still show.
window.RaidarAlpine = (function () {
  const IDENT = /[A-Za-z0-9_$]/;
  const DIGIT = /[0-9]/;
  // words after which "[" starts an array and "/" a regular expression
  const KEYWORDS = new Set(['in', 'of', 'return', 'typeof', 'instanceof', 'new', 'void', 'delete', 'case', 'do',
    'else', 'yield', 'await', 'throw']);
  const REGEX_AFTER = '(,=:[!&|?{};+-*%<>~^';

  // index just past the string literal that starts at i
  function skipString(src, i) {
    const quote = src[i];
    for (i++; i < src.length && src[i] !== quote; i++) {
      if (src[i] === '\\') i++;
    }
    return i + 1;
  }
  // index just past the {...} that starts at i, strings and template literals included
  function skipBraces(src, i) {
    let depth = 0;
    while (i < src.length) {
      const c = src[i];
      if (c === "'" || c === '"') { i = skipString(src, i); continue; }
      if (c === '`') { i = skipTemplate(src, i); continue; }
      if (c === '{') depth++;
      else if (c === '}' && --depth === 0) return i + 1;
      i++;
    }
    return i;
  }
  // index just past the template literal that starts at i
  function skipTemplate(src, i) {
    for (i++; i < src.length && src[i] !== '`';) {
      if (src[i] === '\\') { i += 2; continue; }
      if (src[i] === '$' && src[i + 1] === '{') { i = skipBraces(src, i + 1); continue; }
      i++;
    }
    return i + 1;
  }
  // index just past the regular expression literal that starts at i
  function skipRegex(src, i) {
    let inClass = false;
    for (i++; i < src.length; i++) {
      const c = src[i];
      if (c === '\\') { i++; continue; }
      if (c === '[') inClass = true;
      else if (c === ']') inClass = false;
      else if (c === '/' && !inClass) break;
    }
    for (i++; i < src.length && /[a-z]/.test(src[i]); i++);
    return i;
  }

  // `a.b[c]` becomes `a?.b?.[c]`, leaving strings, numbers, spreads and regular expressions alone
  function optionalChains(src) {
    let out = '';
    let word = '';      // the identifier or number right before i, if any
    let lastWord = '';  // the last identifier, wherever it was
    let lastSig = '';   // the last character that was not whitespace
    for (let i = 0; i < src.length;) {
      const c = src[i];
      if (c === "'" || c === '"') {
        const end = skipString(src, i);
        out += src.slice(i, end);
        i = end; word = ''; lastSig = c;
      } else if (c === '`') {
        // the text of a template literal stays; its ${...} parts are expressions
        let j = i + 1;
        out += '`';
        while (j < src.length && src[j] !== '`') {
          if (src[j] === '\\') {
            out += src.slice(j, j + 2);
            j += 2;
          } else if (src[j] === '$' && src[j + 1] === '{') {
            const end = skipBraces(src, j + 1);
            out += '${' + optionalChains(src.slice(j + 2, end - 1)) + '}';
            j = end;
          } else {
            out += src[j++];
          }
        }
        out += '`';
        i = j + 1; word = ''; lastSig = '`';
      } else if (c === '/' && (lastSig === '' || REGEX_AFTER.includes(lastSig) ||
                                (IDENT.test(lastSig) && KEYWORDS.has(lastWord)))) {
        const end = skipRegex(src, i);
        out += src.slice(i, end);
        i = end; word = ''; lastSig = '/';
      } else if (IDENT.test(c)) {
        let j = i;
        while (j < src.length && IDENT.test(src[j])) j++;
        word = lastWord = src.slice(i, j);
        out += word;
        i = j; lastSig = word[word.length - 1];
      } else if (c === '.' && src.startsWith('...', i)) {
        out += '...';
        i += 3; word = ''; lastSig = '.';
      } else if (c === '.' || c === '[') {
        const prev = src[i - 1];
        const afterValue = (word && !DIGIT.test(word[0]) && !KEYWORDS.has(word)) || prev === ')' || prev === ']';
        out += afterValue ? '?.' + (c === '[' ? '[' : '') : c;
        i++; word = ''; lastSig = c;
      } else {
        out += c;
        i++; word = '';
        if (!/\s/.test(c)) lastSig = c;
      }
    }
    return out;
  }

  let debug = false;
  const lenientMemo = new Map();
  // An expression that reads missing properties as undefined and gives undefined if it throws
  function lenientExpression(src) {
    if (lenientMemo.has(src)) return lenientMemo.get(src);
    let result = src;
    try {
      const chained = optionalChains(src);
      const onError = debug ? `console.debug('Expression error:', __e.message, ${JSON.stringify(src)});` : '';
      const wrapped = `(() => { try { return (${chained}\n); } catch (__e) { ${onError}return undefined; } })()`;
      new Function(`return ${wrapped}`);  // syntax check; if the rewrite is not valid, Alpine gets the original
      result = wrapped;
    } catch (e) {
      if (debug) console.warn('Expression left as written:', src, e);
    }
    lenientMemo.set(src, result);
    return result;
  }

  const FOR_RE = /^([\s\S]*?\s+(?:in|of)\s+)([\s\S]*)$/;
  function isReadOnlyDirective(name) {
    return ['x-text', 'x-html', 'x-show', 'x-visible', 'x-if', 'x-for', 'x-with'].includes(name.split(/[:.]/)[0]) ||
      name.startsWith('x-bind:') || name.startsWith('x-with:');
  }

  // names the templates may use from the browser; any other name is looked up in the data, and is undefined there
  // when nothing sets it
  const GLOBALS = new Set(['Math', 'Number', 'String', 'Boolean', 'Array', 'Object', 'JSON', 'Date', 'Infinity',
    'NaN', 'undefined', 'isNaN', 'isFinite', 'parseInt', 'parseFloat', 'encodeURIComponent', 'decodeURIComponent',
    'console', 'window', 'document', 'Symbol', 'Promise', 'Set', 'Map']);
  // The outermost scope: every name not in GLOBALS reads from, and writes to, the data
  function rootScope(data) {
    return new Proxy(data, {
      has(target, key) {
        // names starting with __ are Alpine's own, in the functions it makes of expressions
        return typeof key === 'string' && !GLOBALS.has(key) && !key.startsWith('__');
      },
    });
  }

  // Reads and writes "a.b.c" keypaths of the data, as Ractive's get and set did
  function keypathStore(data) {
    const splitPath = path => String(path).split('.');
    function get(path) {
      if (path === undefined || path === '') return data;
      return splitPath(path).reduce((obj, key) => obj == null ? undefined : obj[key], data);
    }
    function setOne(path, value) {
      const keys = splitPath(path);
      const last = keys.pop();
      let obj = data;
      for (const key of keys) {
        if (obj[key] == null || typeof obj[key] !== 'object') obj[key] = {};
        obj = obj[key];
      }
      if (last === '*') {
        Object.keys(obj).forEach(key => obj[key] = value);
      } else {
        obj[last] = value;
      }
    }
    return {
      get,
      // set('a.b', value) or set({'a.b': value, ...}); resolves once the page shows the change
      set(path, value) {
        if (path !== null && typeof path === 'object') {
          Object.entries(path).forEach(([key, val]) => setOne(key, val));
        } else {
          setOne(path, value);
        }
        return Alpine.nextTick();
      },
      toggle(path) {
        return this.set(path, !get(path));
      },
      push(path, value) {
        get(path).push(value);
        return Alpine.nextTick();
      },
      // Calls callback(value, oldValue, path) after the value at path changes, anywhere inside it; also right away,
      // unless {init: false}
      observe(path, callback, { init = true } = {}) {
        let first = true;
        let old;
        const runner = Alpine.effect(() => {
          const value = get(path);
          // read every part, so that changes deep inside count
          if (value !== null && typeof value === 'object') JSON.stringify(value);
          const previous = old;
          old = value;
          if (first) {
            first = false;
            if (!init) return;
          }
          // outside the effect, so that what the callback reads does not become a dependency
          queueMicrotask(() => callback(value, previous, path));
        });
        return { cancel: () => Alpine.release(runner) };
      },
    };
  }

  // <template> elements inside <svg> are SVG elements to the parser; make them real templates so that x-if and x-for
  // work there too
  const SVG_NS = 'http://www.w3.org/2000/svg';
  function prepareTemplate(root) {
    Array.from(root.childNodes).forEach(node => {
      if (node.nodeType !== 1) return;
      if (node.localName === 'template' && node.namespaceURI === SVG_NS) {
        const template = document.createElement('template');
        Array.from(node.attributes).forEach(attr => template.setAttribute(attr.name, attr.value));
        while (node.firstChild) template.content.appendChild(node.firstChild);
        node.replaceWith(template);
        prepareTemplate(template.content);
      } else if (node.localName === 'template' && node.content) {
        prepareTemplate(node.content);
      } else {
        prepareTemplate(node);
      }
    });
  }

  function install(options = {}) {
    debug = !!options.debug;

    Alpine.mapAttributes(({ name, value }) => {
      if (!isReadOnlyDirective(name)) return { name, value };
      if (name === 'x-for' || name.startsWith('x-for.')) {
        // null lists nothing, as undefined does (Alpine would take null for an object)
        const match = value.match(FOR_RE);
        return { name, value: match ? match[1] + lenientExpression(`(${match[2]}\n) ?? undefined`) : value };
      }
      return { name, value: lenientExpression(value) };
    });

    // x-with="obj": inside the element, the properties of obj are read and written by name, before the names of
    // the scopes around it; when obj is not an object, nothing is added
    Alpine.directive('with', (el, { expression }, { evaluateLater, effect, cleanup }) => {
      const evaluate = evaluateLater(expression);
      const state = Alpine.reactive({ value: null });
      const context = () => {
        const value = state.value;
        return value !== null && typeof value === 'object' ? value : null;
      };
      const scope = new Proxy({}, {
        has(_, key) {
          const value = context();
          return !!value && key in value;
        },
        get(_, key) {
          const value = context();
          return value ? value[key] : undefined;
        },
        set(_, key, val) {
          const value = context();
          if (value) value[key] = val;
          return true;
        },
        ownKeys() {
          const value = context();
          return value ? Reflect.ownKeys(value) : [];
        },
        getOwnPropertyDescriptor(_, key) {
          const value = context();
          if (value && Object.prototype.hasOwnProperty.call(value, key)) {
            return { value: value[key], writable: true, enumerable: true, configurable: true };
          }
          return undefined;
        },
      });
      cleanup(Alpine.addScopeToNode(el, scope));
      effect(() => evaluate(value => { state.value = value; }));
    }).before('bind');

    // x-visible="expr": display: none while expr is falsy, changed as soon as expr does. (x-show defers showing to
    // the next animation frame and holds back hiding while an element around it is being hidden, which can leave
    // elements in the wrong state when lists around them are re-rendered.)
    Alpine.directive('visible', (el, { expression }, { evaluateLater, effect }) => {
      const evaluate = evaluateLater(expression);
      effect(() => evaluate(value => {
        if (value) {
          el.style.removeProperty('display');
          if (!el.style.length) el.removeAttribute('style');
        } else {
          el.style.setProperty('display', 'none');
        }
      }));
    });

    // x-select-model="key.path": the option values are JSON (value="null", :value="JSON.stringify(id)"); choosing
    // one sets the keypath to the parsed value, and the option equal to the keypath's value is shown
    Alpine.directive('select-model', (el, { expression }, { effect, cleanup }) => {
      const store = options.store;
      const parse = text => {
        try {
          return JSON.parse(text);
        } catch (e) {
          return text;
        }
      };
      const sync = () => {
        const value = store.get(expression);
        const options = Array.from(el.options);
        if (value === undefined) {
          // as Ractive did, an unset keypath takes the value of the option shown (the first one)
          const option = options.find(option => !option.disabled);
          if (option) store.set(expression, parse(option.value));
          return;
        }
        const index = options.findIndex(option => !option.disabled && parse(option.value) == value);
        if (index !== -1) el.selectedIndex = index;
      };
      const onChange = () => {
        const option = el.options[el.selectedIndex];
        store.set(expression, option ? parse(option.value) : null);
      };
      el.addEventListener('change', onChange);
      // the options may come later (x-for) and change
      const observer = new MutationObserver(sync);
      observer.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['value'] });
      effect(() => {
        const value = store.get(expression);
        if (value !== null && typeof value === 'object') JSON.stringify(value);
        Alpine.nextTick(sync);
      });
      cleanup(() => {
        el.removeEventListener('change', onChange);
        observer.disconnect();
      });
    }).before('on');
  }

  return { install, lenientExpression, rootScope, keypathStore, prepareTemplate };
})();
