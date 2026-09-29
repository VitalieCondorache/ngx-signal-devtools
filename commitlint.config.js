module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      ['lib', 'demo', 'core', 'ui', 'docs', 'ci', 'deps', 'release', 'workspace'],
    ],
    'subject-case': [2, 'always', ['sentence-case', 'lower-case']],
  },
};
