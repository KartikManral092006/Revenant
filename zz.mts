import fc from 'fast-check';
let t=Date.now();
console.log('start');
fc.sample(fc.string({maxLength:8}),{seed:1,numRuns:10}); console.log('string', Date.now()-t);
fc.sample(fc.stringMatching(/^[ A-Za-z0-9_\-.<>/]{0,24}$/),{seed:1,numRuns:10}); console.log('sm', Date.now()-t);
