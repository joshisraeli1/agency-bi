import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function main() {
  const TOKEN = process.env.MONDAY_API_TOKEN!;
  const res = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: TOKEN, "API-Version": "2024-10" },
    body: JSON.stringify({ query: "{ boards(limit: 200) { id name } }" }),
  });
  const data = await res.json();
  if (data.errors) { console.error("API errors:", data.errors); return; }
  if (!data.data?.boards) { console.error("Unexpected response:", JSON.stringify(data).slice(0, 500)); return; }
  const boards = data.data.boards;

  console.log(`Found ${boards.length} boards\n`);

  console.log("⏱️  Likely time tracking boards:");
  for (const b of boards) {
    const name = b.name.toLowerCase();
    if (name.includes("time") || name.includes("track") || name.includes("hours") || name.includes("log")) {
      console.log(`   ${b.id}  ${b.name}`);
    }
  }

  console.log("\nAll boards:");
  for (const b of boards) {
    console.log(`   ${b.id}  ${b.name}`);
  }
}

main().catch(console.error);
