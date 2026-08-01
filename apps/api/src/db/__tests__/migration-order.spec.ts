import * as fs from 'fs';
import * as path from 'path';

describe('Migration Order & Safety Guard', () => {
  const migrationsDir = path.join(__dirname, '../migrations');

  function getMigrationFiles(): string[] {
    return fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.ts') && !file.endsWith('.d.ts'))
      .sort();
  }

  it('should have strictly increasing numeric timestamp prefixes in filename order', () => {
    const files = getMigrationFiles();
    let prevTimestamp = 0;

    for (const file of files) {
      const match = file.match(/^(\d+)-/);
      expect(match).not.toBeNull();
      const timestamp = parseInt(match![1], 10);
      expect(timestamp).toBeGreaterThan(prevTimestamp);
      prevTimestamp = timestamp;
    }
  });

  it('should match exported class name and name property with filename timestamp', () => {
    const files = getMigrationFiles();

    for (const file of files) {
      const match = file.match(/^(\d+)-(.*)\.ts$/);
      expect(match).not.toBeNull();
      const timestamp = match![1];
      const baseName = match![2];
      const expectedName = `${baseName}${timestamp}`;

      const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

      // Assert exported class name matches
      expect(content).toContain(`export class ${expectedName}`);

      // Assert name property matches
      expect(content).toContain(`name = '${expectedName}'`);
    }
  });

  it('should not contain DROP TABLE in up() unless table is CREATEd in the same up()', () => {
    const files = getMigrationFiles();

    for (const file of files) {
      const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

      // Extract up() method block
      const upMatch = content.match(
        /public async up\([\s\S]*?\): Promise<void> \{([\s\S]*?)\n {2}\}/,
      );
      if (!upMatch) continue;
      const upBody = upMatch[1];

      // Find all DROP TABLE instances
      const dropMatches = Array.from(
        upBody.matchAll(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?([^\s;]+)/gi),
      );

      for (const dropMatch of dropMatches) {
        const droppedTablesStr = dropMatch[1];
        // Clean table names (remove quotes and commas)
        const droppedTables = droppedTablesStr
          .split(',')
          .map((t) => t.replace(/["\s]/g, ''))
          .filter(Boolean);

        for (const table of droppedTables) {
          // Check if table is created in upBody
          const createRegex = new RegExp(
            `CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?"?${table}"?`,
            'i',
          );
          expect(upBody).toMatch(createRegex);
        }
      }
    }
  });
});
