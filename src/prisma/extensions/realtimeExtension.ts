import { Prisma, PrismaClient } from '@prisma/client';
import { Subject, filter } from 'rxjs';

/** Returns the current change tracking version. */
async function getCurrentVersion(prismaClient: {
  $queryRawUnsafe: PrismaClient['$queryRawUnsafe'];
}) {
  const result: { currentVersion: bigint }[] =
    await prismaClient.$queryRawUnsafe(
      `SELECT CHANGE_TRACKING_CURRENT_VERSION() AS currentVersion`,
    );
  return result[0].currentVersion;
}

async function setupDB(
  prismaClient: {
    $executeRawUnsafe: PrismaClient['$executeRawUnsafe'];
  },
  databaseName: string,
  modelDbNameMap: Map<string, string>,
) {
  try {
    await prismaClient.$executeRawUnsafe(`
    ALTER DATABASE [${databaseName}]
    SET CHANGE_TRACKING = ON
    (CHANGE_RETENTION = 5 MINUTES, AUTO_CLEANUP = ON);
    `);
  } catch {}
  // Enable change tracking for each model/table.
  for (const value of modelDbNameMap.values()) {
    try {
      await prismaClient.$executeRawUnsafe(`
      ALTER TABLE dbo.[${value}]
      ENABLE CHANGE_TRACKING WITH (TRACK_COLUMNS_UPDATED = ON);
      `);
    } catch {}
  }
}

/** Returns changes for each table since the given version. */
async function getChanges(
  tables: Iterable<string>,
  prismaClient: {
    $queryRawUnsafe: PrismaClient['$queryRawUnsafe'];
    $executeRawUnsafe: PrismaClient['$executeRawUnsafe'];
  },
  lastVersion: bigint,
  databaseName: string,
  modelDbNameMap: Map<string, string>,
) {
  const queries = Array.from(tables).map(async table => {
    try {
      const recordset: { SYS_CHANGE_OPERATION: string; id: string }[] =
        await prismaClient.$queryRawUnsafe(`
      DECLARE @lastVersion BIGINT = ${lastVersion};
      SELECT CT.*
      FROM CHANGETABLE(CHANGES dbo.[${table}], @lastVersion) AS CT;
    `);
      return { operation: table, result: recordset };
    } catch (e) {
      try {
        await setupDB(prismaClient, databaseName, modelDbNameMap);
      } catch (e) {
        console.error(JSON.stringify(e));
      }
      console.error(JSON.stringify(e));
      throw e;
    }
  });
  return Promise.all(queries);
}

type OPERATIONS = 'UPDATE' | 'DELETE' | 'INSERT';

/**
 * Realtime extension for Prisma with mssql.
 */
export default function realtimeExtension({
  intervalMs,
}: {
  intervalMs: number;
}) {
  return Prisma.defineExtension(prismaClient => {
    const poolRef: { lastSyncVersion: bigint; setupDB: boolean } = {
      setupDB: false,
      lastSyncVersion: BigInt(0),
    };

    const subjects = new Map<
      Prisma.ModelName,
      Subject<{ id: string; operation: OPERATIONS }>
    >();

    // Filter models that have an ID field and create maps between model names and their DB names.
    const models = Prisma.dmmf.datamodel.models.filter(m =>
      m.fields.some(f => f.isId),
    );
    const modelDbNameMap = new Map(
      models.map(m => [m.name, m.dbName ?? m.name]),
    );
    const modelNameMap = new Map(models.map(m => [m.dbName ?? m.name, m.name]));

    const databaseName = process.env
      .DATABASE_URL!.split(';')
      .find(p => p.startsWith('database='))!
      .replace('database=', '');

    setupDB(prismaClient, databaseName, modelDbNameMap).then(() => {
      poolRef.setupDB = true;
    });

    /** Polls the database for changes and notifies subscribers. */
    async function pollChanges() {
      try {
        if (poolRef.lastSyncVersion === BigInt(0)) {
          poolRef.lastSyncVersion = await getCurrentVersion(prismaClient);
        } else {
          const changes = await getChanges(
            modelDbNameMap.values(),
            prismaClient,
            poolRef.lastSyncVersion,
            databaseName,
            modelDbNameMap,
          );
          for (const { operation, result } of changes) {
            for (const change of result) {
              const { SYS_CHANGE_OPERATION, id } = change;
              const opMap: Record<string, OPERATIONS> = {
                U: 'UPDATE',
                I: 'INSERT',
                D: 'DELETE',
              };
              const operationStr = opMap[SYS_CHANGE_OPERATION];
              if (!operationStr) continue;
              const modelName = modelNameMap.get(operation)!;
              subjects
                .get(modelName as Prisma.ModelName)
                ?.next({ id, operation: operationStr });
            }
          }
          poolRef.lastSyncVersion = await getCurrentVersion(prismaClient);
        }
      } catch (e) {
        console.error('c', JSON.stringify(e));
      }
    }

    setInterval(pollChanges, intervalMs);

    return prismaClient.$extends({
      model: {
        $allModels: {
          /**
           * Allows subscribing to database changes, also allows you to filter by an id and / or an operation (e.g. UPDATE, DELETE, INSERT).
           */
          subscribe<T>(
            this: T,
            args: { id?: string; operations: (OPERATIONS | '*')[] },
          ) {
            const context = Prisma.getExtensionContext(this) as {
              $name: Prisma.ModelName;
            };
            const modelName = context.$name;
            if (!subjects.has(modelName))
              subjects.set(
                modelName,
                new Subject<{ id: string; operation: OPERATIONS }>(),
              );
            let observable = subjects.get(modelName)!.asObservable();

            if (args.id !== undefined)
              observable = observable.pipe(
                filter(event => args.id === event.id),
              );

            if (!args.operations.includes('*'))
              observable = observable.pipe(
                filter(event => args.operations.includes(event.operation)),
              );

            return observable;
          },
        },
      },
    });
  });
}
