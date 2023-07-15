import { awscdk } from 'projen';
import { NodePackageManager } from 'projen/lib/javascript';
const project = new awscdk.AwsCdkTypeScriptApp({
  cdkVersion: '2.87.0',
  defaultReleaseBranch: 'main',
  name: 'link_sanitizer',
  projenrcTs: true,
  vscode: false,
  packageManager: NodePackageManager.PNPM,
  pnpmVersion: '8',
  // deps: [],                /* Runtime dependencies of this module. */
  // description: undefined,  /* The description is just a string that helps people understand the purpose of the package. */
  devDeps: [
    '@types/aws-lambda',
    '@aws-sdk/client-ssm',
    '@aws-sdk/client-sqs',
    '@aws-lambda-powertools/parameters',
    'node-telegram-bot-api',
    '@types/node-telegram-bot-api',
  ],
  lambdaOptions: { bundlingOptions: { externals: ['aws-sdk'] } },
  // packageName: undefined,  /* The "name" in package.json. */
});
project.synth();
