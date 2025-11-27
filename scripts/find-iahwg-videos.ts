import { getTursoClient } from "@/lib/turso";

async function findIAHWGVideos() {
  const client = await getTursoClient();

  const result = await client.execute(`
    SELECT asset_id, date, clean_title 
    FROM videos 
    WHERE clean_title LIKE '%IAHWG%' 
       OR clean_title LIKE '%Informal Ad Hoc Working Group%'
    ORDER BY date
  `);

  console.log(`Found ${result.rows.length} IAHWG videos:\n`);
  result.rows.forEach((v) => {
    console.log(`${v.asset_id} | ${v.date} | ${v.clean_title}`);
  });
}

findIAHWGVideos().catch(console.error);
