const { CfnOutput, SecretValue, Stack, Duration } = require('aws-cdk-lib');
const acm = require('aws-cdk-lib/aws-certificatemanager');
const apigateway = require('aws-cdk-lib/aws-apigateway');
const cloudfront = require('aws-cdk-lib/aws-cloudfront');
const codebuild = require('aws-cdk-lib/aws-codebuild');
const codepipeline = require('aws-cdk-lib/aws-codepipeline');
const codepipeline_actions = require('aws-cdk-lib/aws-codepipeline-actions');
const iam = require('aws-cdk-lib/aws-iam');
const lambda = require('aws-cdk-lib/aws-lambda');
const origins = require('aws-cdk-lib/aws-cloudfront-origins');
const path = require('path');
const route53 = require('aws-cdk-lib/aws-route53');
const s3 = require('aws-cdk-lib/aws-s3');
const targets = require('aws-cdk-lib/aws-route53-targets');

class InfraStack extends Stack {
  constructor(scope, id, props) {
    super(scope, id, props);

    // inputs from .env
    const domainName = process.env.SITE_URL
    const apiDomain = `api.${domainName}`
    const repositoryOwner = process.env.GITHUB_REPOSITORY_OWNER
    const repositoryName = process.env.GITHUB_REPOSITORY_NAME
    const githubOauthToken = process.env.GITHUB_OAUTH_TOKEN

    // dns
    const hostedZone = new route53.HostedZone(this, 'hostedZone', {
      zoneName: domainName,
    });

    const appCertificate = new acm.DnsValidatedCertificate(this, 'appCertificate', {
      domainName,
      hostedZone,
      region: 'us-east-1',
    });

    const apiCertificate = new acm.DnsValidatedCertificate(this, 'apiCertificate', {
      domainName: apiDomain,
      hostedZone
    });

    // web tier
    const bucket = new s3.Bucket(this, 'monorepo-bucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
    });

    const distribution = new cloudfront.Distribution(this, 'monorepo-distribution', {
      defaultBehavior: {
        origin: new origins.S3Origin(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        compress: true,
      },
      defaultRootObject: 'index.html',
      domainNames: [domainName],
      certificate: appCertificate,
      errorResponses: [{
        httpStatus: 404,
        responseHttpStatus: 200,
        responsePagePath: '/index.html'
      }, {
        httpStatus: 403,
        responseHttpStatus: 200,
        responsePagePath: '/index.html'
      }],
      httpVersion: cloudfront.HttpVersion.HTTP2,
    });

    new route53.ARecord(this, 'appDistributionRecord', {
      recordName: domainName,
      zone: hostedZone,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
    })

    // app tier
    const handler = new lambda.Function(this, 'monorepo-fn', {
      code: lambda.Code.fromAsset(path.join(__dirname, '../../api')),
      handler: 'callbackcode.handler',
      runtime: lambda.Runtime.PYTHON_3_7,
      logRetention: 7,
    });
    const restApi = new apigateway.LambdaRestApi(this, 'monorepo-api', {
      domainName: {
        domainName: apiDomain,
        certificate: apiCertificate,
      },
      handler: handler,
    });

    new route53.ARecord(this, 'monorepo-apiGatewayRecord', {
      recordName: apiDomain,
      zone: hostedZone,
      target: route53.RecordTarget.fromAlias(new targets.ApiGateway(restApi)),
    })

    // pipeline
    const sourceOutput = new codepipeline.Artifact();
    const appSource = new codepipeline_actions.GitHubSourceAction({
      actionName: 'GitHub_Source',
      owner: repositoryOwner,
      repo: repositoryName,
      oauthToken: SecretValue.secretsManager(githubOauthToken),
      output: sourceOutput,
      branch: 'main',
    });

    const appBuildProject = new codebuild.PipelineProject(this, 'monorepo-build', {
      buildSpec: codebuild.BuildSpec.fromSourceFilename('web/buildspec.yml'),
      environment: {
        image: codebuild.LinuxBuildImage.STANDARD_5_0,
      },
      environmentVariables: {
        API_ENDPOINT: { value: `https://${apiDomain}/prod/request` },
        DISTRIBUTION_ID: { value: distribution.distributionId },
        S3_BUCKET: { value: bucket.bucketName },
        SITE_URL: {value: domainName },
      }
    });
    const appBuild = new codepipeline_actions.CodeBuildAction({
      actionName: 'CodeBuild',
      project: appBuildProject,
      input: sourceOutput,
    });
    bucket.grantReadWrite(appBuildProject.role);
    appBuildProject.role.attachInlinePolicy(new iam.Policy(this, `${domainName}-invalidate`, {
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['cloudfront:CreateInvalidation'],
          resources: [`arn:aws:cloudfront::${this.account}:distribution/${distribution.distributionId}`],
        }),
      ]
    }));
    const pipeline = new codepipeline.Pipeline(this, 'monorepo-pipeline', {
      pipelineName: `${domainName}-deploy`,
      stages: [
        {
          stageName: 'Source',
          actions: [appSource],
        },
        {
          stageName: 'BuildAndDeploy',
          actions: [appBuild],
        },
      ],
    });

    // outputs
    new CfnOutput(this, 'bucket', {
      value: bucket.bucketName,
    });
    new CfnOutput(this, 'distribution-url', {
      value: distribution.domainName
    });
    new CfnOutput(this, 'distribution-id', {
      value: distribution.distributionId
    });
    new CfnOutput(this, 'api', {
      value: `https://${restApi.restApiId}.execute-api.${this.region}.amazonaws.com/prod/request`,
    });
    new CfnOutput(this, 'pipeline', {
      value: pipeline.pipelineName,
    });
  }
}

module.exports = { InfraStack }
