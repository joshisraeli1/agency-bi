import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const BOARD_ID = process.argv[2];
if (!BOARD_ID) { console.error("Usage: npx tsx scripts/inspect-monday-board.ts <boardId>"); process.exit(1); }

async function main() {
  const TOKEN = process.env.MONDAY_API_TOKEN!;
  const res = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: TOKEN, "API-Version": "2024-10" },
    body: JSON.stringify({
      query: `query($id:[ID!]!) { boards(ids:$id) { name columns { id title type } items_page(limit:3) { items { id name group { title } column_values { id type text value } } } } }`,
      variables: { id: [BOARD_ID] },
    }),
  });
  const data = await res.json();
  if (data.errors) { console.error(data.errors); return; }
  const board = data.data.boards[0];
  console.log(`Board: ${board.name}\n`);
  console.log("Columns:");
  for (const c of board.columns) console.log(`  ${c.id.padEnd(30)} ${c.type.padEnd(20)} ${c.title}`);
  console.log(`\nSample items (${board.items_page.items.length}):`);
  for (const item of board.items_page.items) {
    console.log(`\n  Item: ${item.name}  |  Group: ${item.group.title}`);
    for (const cv of item.column_values) {
      if (cv.text || cv.value) console.log(`    ${cv.id.padEnd(25)} ${cv.type.padEnd(18)} text="${cv.text}"  val=${cv.value?.slice(0, 80)}`);
    }
  }
}
main().catch(console.error);
