interface TechnologyKeyword {
  name: string;
  patterns: RegExp[];
}

const TECHNOLOGY_CATEGORIES = {
  Languages: [
    'TypeScript', 'JavaScript', 'Java', 'Python', 'C#', 'Go', 'Kotlin', 'C++',
    'Rust', 'PHP', 'Ruby', 'Scala', 'Swift',
  ],
  Frontend: ['Next.js', 'React', 'Vue', 'Angular', 'Svelte', 'HTML'],
  Backend: [
    'Spring', 'Node.js', '.NET', 'Ruby on Rails', 'NestJS', 'Express.js',
    'Django', 'Flask', 'FastAPI',
  ],
  Styling: ['CSS', 'Tailwind CSS', 'Sass', 'Bootstrap'],
  Mobile: ['React Native', 'Flutter'],
  'Data & APIs': [
    'SQL', 'PostgreSQL', 'MySQL', 'SQL Server', 'MongoDB', 'Redis',
    'Elasticsearch', 'Oracle', 'Snowflake', 'Prisma', 'GraphQL', 'REST',
    'WebSockets', 'Kafka', 'RabbitMQ', 'Spark',
  ],
  'Cloud & infrastructure': [
    'AWS', 'Azure', 'Google Cloud', 'Docker', 'Kubernetes', 'Terraform', 'Helm',
    'Linux',
  ],
  'Build & monorepo': ['Bun', 'Deno', 'Vite', 'Webpack', 'Turborepo', 'Nx'],
  'Testing & delivery': [
    'Jenkins', 'GitHub Actions', 'GitLab CI', 'CI/CD', 'Git', 'Jest', 'Vitest',
    'Playwright', 'Cypress',
  ],
  'Data & AI': [
    'TensorFlow', 'PyTorch', 'scikit-learn', 'Pandas', 'NumPy', 'LLM', 'NLP',
    'RAG', 'LangChain', 'Hugging Face',
  ],
} as const;

export interface TechnologyGroup {
  category: string;
  technologies: string[];
}

const TECHNOLOGY_KEYWORDS: TechnologyKeyword[] = [
  { name: 'TypeScript', patterns: [/\bTypeScript\b/i] },
  { name: 'JavaScript', patterns: [/\bJavaScript\b/i, /\bECMAScript\b/i] },
  { name: 'Next.js', patterns: [/\bNext\.js\b/i, /\bNextJS\b/i] },
  { name: 'React', patterns: [/\bReact(?:\.js|JS)?\b/] },
  { name: 'Java', patterns: [/\bJava\b/i] },
  { name: 'Spring', patterns: [/\bSpring(?: Boot)?\b/i] },
  { name: 'Node.js', patterns: [/\bNode\.js\b/i, /\bNodeJS\b/i] },
  { name: 'Python', patterns: [/\bPython\b/i] },
  { name: 'C#', patterns: [/\bC#(?=\s|[,.);:/]|$)/i] },
  { name: '.NET', patterns: [/(?:^|\s)\.NET\b/i, /\bDotnet\b/i] },
  { name: 'Go', patterns: [/\bGo\b/, /\bGolang\b/i] },
  { name: 'Kotlin', patterns: [/\bKotlin\b/i] },
  { name: 'C++', patterns: [/\bC\+\+(?=\s|[,.);:/]|$)/i] },
  { name: 'Rust', patterns: [/\bRust\b/i] },
  { name: 'PHP', patterns: [/\bPHP\b/i] },
  { name: 'Ruby', patterns: [/\bRuby\b/i] },
  { name: 'Ruby on Rails', patterns: [/\bRuby on Rails\b/i, /\bRails\b/i] },
  { name: 'Scala', patterns: [/\bScala\b/i] },
  { name: 'Vue', patterns: [/\bVue(?:\.js|JS)?\b/i] },
  { name: 'Angular', patterns: [/\bAngular\b/i] },
  { name: 'Svelte', patterns: [/\bSvelte(?:Kit)?\b/i] },
  { name: 'React Native', patterns: [/\bReact Native\b/i] },
  { name: 'Flutter', patterns: [/\bFlutter\b/i] },
  { name: 'Swift', patterns: [/\bSwift\b/] },
  { name: 'HTML', patterns: [/\bHTML5?\b/i] },
  { name: 'CSS', patterns: [/\bCSS3?\b/i] },
  { name: 'Tailwind CSS', patterns: [/\bTailwind(?: CSS)?\b/i] },
  { name: 'Sass', patterns: [/\bSass\b/i, /\bSCSS\b/i] },
  { name: 'Bootstrap', patterns: [/\bBootstrap\b/i] },
  { name: 'Bun', patterns: [/\bBun\b/] },
  { name: 'Deno', patterns: [/\bDeno\b/i] },
  { name: 'Vite', patterns: [/\bVite\b/i] },
  { name: 'Webpack', patterns: [/\bWebpack\b/i] },
  { name: 'Turborepo', patterns: [/\bTurborepo\b/i, /\bTurboRepo\b/] },
  { name: 'Nx', patterns: [/\bNx\b/] },
  { name: 'NestJS', patterns: [/\bNestJS\b/i, /\bNest\.js\b/i] },
  {
    name: 'Express.js',
    patterns: [/\bExpress\.js\b/i, /\bExpressJS\b/i, /\bExpress\b/],
  },
  { name: 'Django', patterns: [/\bDjango\b/i] },
  { name: 'Flask', patterns: [/\bFlask\b/i] },
  { name: 'FastAPI', patterns: [/\bFastAPI\b/i] },
  { name: 'SQL', patterns: [/\bSQL\b/] },
  { name: 'PostgreSQL', patterns: [/\bPostgreSQL\b/i, /\bPostgres\b/i] },
  { name: 'MySQL', patterns: [/\bMySQL\b/i] },
  { name: 'SQL Server', patterns: [/\bSQL Server\b/i, /\bMSSQL\b/i] },
  { name: 'MongoDB', patterns: [/\bMongoDB\b/i] },
  { name: 'Redis', patterns: [/\bRedis\b/i] },
  { name: 'Elasticsearch', patterns: [/\bElasticsearch\b/i] },
  { name: 'Oracle', patterns: [/\bOracle(?: Database| DB)?\b/i] },
  { name: 'Snowflake', patterns: [/\bSnowflake\b/i] },
  { name: 'Prisma', patterns: [/\bPrisma\b/i] },
  { name: 'GraphQL', patterns: [/\bGraphQL\b/i] },
  { name: 'REST', patterns: [/\bREST(?:ful)?\b/] },
  { name: 'WebSockets', patterns: [/\bWebSockets?\b/i] },
  { name: 'Kafka', patterns: [/\bKafka\b/i] },
  { name: 'RabbitMQ', patterns: [/\bRabbitMQ\b/i] },
  { name: 'Spark', patterns: [/\bApache Spark\b/i, /\bPySpark\b/i] },
  { name: 'AWS', patterns: [/\bAWS\b/, /\bAmazon Web Services\b/i] },
  { name: 'Azure', patterns: [/\bAzure\b/i] },
  { name: 'Google Cloud', patterns: [/\bGoogle Cloud\b/i, /\bGCP\b/] },
  { name: 'Docker', patterns: [/\bDocker\b/i] },
  { name: 'Kubernetes', patterns: [/\bKubernetes\b/i, /\bK8s\b/i] },
  { name: 'Terraform', patterns: [/\bTerraform\b/i] },
  { name: 'Helm', patterns: [/\bHelm\b/] },
  { name: 'Jenkins', patterns: [/\bJenkins\b/i] },
  { name: 'GitHub Actions', patterns: [/\bGitHub Actions\b/i] },
  { name: 'GitLab CI', patterns: [/\bGitLab CI\b/i] },
  { name: 'CI/CD', patterns: [/\bCI\s*\/\s*CD\b/i] },
  { name: 'Git', patterns: [/\bGit\b/] },
  { name: 'Linux', patterns: [/\bLinux\b/i] },
  { name: 'Jest', patterns: [/\bJest\b/] },
  { name: 'Vitest', patterns: [/\bVitest\b/i] },
  { name: 'Playwright', patterns: [/\bPlaywright\b/i] },
  { name: 'Cypress', patterns: [/\bCypress\b/i] },
  { name: 'TensorFlow', patterns: [/\bTensorFlow\b/i] },
  { name: 'PyTorch', patterns: [/\bPyTorch\b/i] },
  { name: 'scikit-learn', patterns: [/\bscikit-learn\b/i, /\bsklearn\b/i] },
  { name: 'Pandas', patterns: [/\bPandas\b/i] },
  { name: 'NumPy', patterns: [/\bNumPy\b/i] },
  { name: 'LLM', patterns: [/\bLLMs?\b/i, /\bLarge Language Models?\b/i] },
  { name: 'NLP', patterns: [/\bNLP\b/, /\bNatural Language Processing\b/i] },
  { name: 'RAG', patterns: [/\bRAG\b/] },
  { name: 'LangChain', patterns: [/\bLangChain\b/i] },
  { name: 'Hugging Face', patterns: [/\bHugging Face\b/i] },
];

export function extractTechnologyKeywords(text: string): string[] {
  return TECHNOLOGY_KEYWORDS.flatMap(({ name, patterns }) => {
    return patterns.some((pattern) => pattern.test(text)) ? [name] : [];
  });
}

export function groupTechnologies(technologies: string[]): TechnologyGroup[] {
  const remaining = new Set(technologies);
  const groups = Object.entries(TECHNOLOGY_CATEGORIES).flatMap(
    ([category, categoryTechnologies]) => {
      const matches = categoryTechnologies.filter((technology) =>
        remaining.delete(technology),
      );
      return matches.length > 0 ? [{ category, technologies: matches }] : [];
    },
  );

  return remaining.size > 0
    ? [...groups, { category: 'Other', technologies: [...remaining] }]
    : groups;
}
