
async function main() {
  console.log("Calling DELETE endpoint...");
  try {
    const res = await fetch("http://localhost:5000/api/sigorta/muhasebe-clear/mapfre", {
      method: "DELETE"
    });
    const json = await res.json();
    console.log("Response:", json);
  } catch (error) {
    console.error("Error calling endpoint:", error);
  }
}

main();
