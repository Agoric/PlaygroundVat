import test from 'tape';
import { confineVatSource, makeRealm, buildVat, bundleCode } from '../src/main';
import SES from 'ses';
import { promisify } from 'util';


test('marshal', async (t) => {
  const s = SES.makeSESRootRealm();
  const code = await bundleCode(require.resolve('../src/vat/webkey'));
  const e = confineVatSource(s, code);

  function makeLocalWebKey(localObject) {
    // for testing, assume the object is an array
    return `wk${localObject[0]}`;
  }

  function makeFarResourceMaker(serialize, unserialize) {
    function makeFarResource(webkey) {
      if (webkey === 'fr1') {
        return {farref: 123};
      }
      if (webkey === 'fr2') {
        return {farref: 456};
      }
      throw 'not found';
    }
    return makeFarResource;
  }

  const m = e.makeWebkeyMarshal(makeLocalWebKey, makeFarResourceMaker);
  t.equal(m.serialize(1), '1');
  t.equal(m.serialize('abc'), '"abc"');
  t.equal(m.serialize(true), 'true');

  // this stashes the array in the marshal's tables
  t.equal(m.serialize([1,2]), '{"@qclass":"webkey","webkey":"wk1"}');

  t.equal(m.unserialize('1'), 1);
  t.equal(m.unserialize('"abc"'), 'abc');
  t.equal(m.unserialize('false'), false);
  
  const w1 = m.serialize([2,3]); // wk2
  t.deepEqual(m.unserialize(w1), [2,3]); // comes back out of the table

  // far ref
  t.deepEqual(m.unserialize('{"@qclass":"webkey","webkey":"fr1"}'),
              { farref: 123 });

  t.end();
});


function funcToSource(f) {
  let code = `${f}`;
  code = code.replace(/^function .* {/, '');
  code = code.replace(/}$/, '');
  return code;
}

function s1() {
  exports.run = (arg1, arg2) => {
    return arg1;
  };

}

test('deliver farref to vat', async (t) => {
  const s = makeRealm();
  const v = await buildVat(s, 'v1', () => {}, funcToSource(s1));
  const args = JSON.stringify({method: 'run',
                               args: [{'@qclass': 'webkey',
                                       webkey: 'wk1'
                                      }]});

  const r = await v.sendReceived(`msg: v2->v1 ${args}`);
  t.deepEqual(r, { farref: 'wk1' });

  t.end();
});