import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function bootstrapAdminSql(userId) {
  if (typeof userId !== 'string' || !userId.trim()) {
    throw new Error('Provide the ID of an existing, verified local user.');
  }
  const id = `'${userId.replaceAll("'", "''")}'`;
  return `
INSERT INTO profiles(user_id,role)
SELECT id,'admin' FROM user WHERE id=${id} AND emailVerified=1
AND NOT EXISTS(SELECT 1 FROM profiles WHERE role='admin')
ON CONFLICT(user_id) DO UPDATE SET role='admin';
INSERT INTO audit_log(id,actor_id,action,target_id,detail)
SELECT lower(hex(randomblob(16))),${id},'bootstrap_admin',${id},'Local CLI bootstrap'
WHERE changes()=1;
SELECT user_id,role FROM profiles WHERE user_id=${id};
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [scope, userId, ...extra] = process.argv.slice(2);
  if (scope !== '--local' || !userId || extra.length) {
    console.error('Usage: npm run admin -- --local <user-id>');
    process.exitCode = 1;
  } else {
    const result = spawnSync(
      process.execPath,
      [
        fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url)),
        'd1',
        'execute',
        'coeliac-malta',
        '--local',
        '--command',
        bootstrapAdminSql(userId),
      ],
      { stdio: 'inherit', shell: false },
    );
    if (result.error) console.error(result.error.message);
    process.exitCode = result.status ?? 1;
    if (process.exitCode === 0) {
      console.log(
        'Check the result above for role=admin. Only the first verified local admin can be bootstrapped; subsequent roles are managed in the app.',
      );
    }
  }
}
