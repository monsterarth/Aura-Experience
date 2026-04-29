const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const staff = await prisma.staff.findMany({
    select: { name: true, scheduleType: true, scheduleConfig: true }
  });
  console.log(JSON.stringify(staff.filter(s => s.scheduleType === '6x1'), null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
