
const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME ?? "";

if (!/^v\d+\.\d+\.\d+$/.test(tag)) {
  console.error(`Invalid release tag "${tag}". Expected format v1.2.3 (not branch names like "main").`);
  process.exit(1);
}

process.stdout.write(tag);
