import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { validatePasskeySessions, encryptPasskeySecret, decryptPasskeySecret, generateTotp, validatePasskeyEnrollmentFactor } from '../../src/lib/passkey-mfa.server.ts';
const token = claims => `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
const now = Math.floor(Date.now()/1000);
const password = {sub:'user-a',session_id:'password-session',exp:now+3600,amr:[{method:'password',timestamp:now-60}]};
const passkey = {sub:'user-a',session_id:'passkey-session',iat:now,exp:now+3600,amr:[{method:'passkey',timestamp:now}]};
const validate = (p=passkey,w=password,u='user-a') => validatePasskeySessions(token(w),token(p),'user-a',u);
test('same-account fresh password + passkey session is accepted',()=>assert.equal(validate(),null));
test('rejects old ceremonies even with a freshly refreshed JWT',()=>assert.match(validate({...passkey,iat:now,amr:[{method:'passkey',timestamp:now-900}]}),/expired/));
test('rejects missing or future ceremony timestamps',()=>{
  assert.match(validate({...passkey,amr:['passkey']}),/expired/);
  assert.match(validate({...passkey,amr:[{method:'passkey',timestamp:now+3600}]}),/expired/);
});
test('rejects mismatched accounts, sessions and methods',()=>{
 assert.match(validate(passkey,password,'user-b'),/different accounts/);
 assert.match(validate({...passkey,sub:'user-b'}),/identity/);
 assert.match(validate({...passkey,session_id:password.session_id}),/fresh passkey/);
 assert.match(validate({...passkey,amr:[{method:'password',timestamp:now}]}),/not a passkey/);
 assert.match(validate(passkey,{...password,amr:[{method:'otp',timestamp:now}]}),/not a password/);
 assert.match(validate({...passkey,exp:now-1}),/expired/);
});
test('only a managed TOTP factor can be enrolled',()=>{
 assert.match(validatePasskeyEnrollmentFactor([{id:'a',factor_type:'totp',friendly_name:'Personal authenticator',status:'verified'}],'a'),/wrong name/);
});
test('encrypted secrets reject tampering and wrong keys',()=>{
 process.env.PASSKEY_MFA_KEY=randomBytes(32).toString('base64');
 const encrypted=encryptPasskeySecret('JBSWY3DPEHPK3PXP');
 assert.equal(decryptPasskeySecret(encrypted),'JBSWY3DPEHPK3PXP');
 const parts=encrypted.split('.'); const bytes=Buffer.from(parts[2],'base64url');bytes[0]^=1;parts[2]=bytes.toString('base64url');
 assert.throws(()=>decryptPasskeySecret(parts.join('.')));
 process.env.PASSKEY_MFA_KEY=randomBytes(32).toString('base64');
 assert.throws(()=>decryptPasskeySecret(encrypted));
 delete process.env.PASSKEY_MFA_KEY;
});
test('TOTP matches the six-digit RFC 6238 vector',()=>assert.equal(generateTotp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',59000),'287082'));
