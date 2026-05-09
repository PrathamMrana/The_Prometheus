const { io } = require("socket.io-client");
const socket = io("http://localhost:3001");
socket.on("connect", () => {
    socket.on("STATE", (msg) => {
        console.log("STATE items count:", msg?.data?.length);
        console.log("STATE items:", msg?.data?.map(o => o.symbol));
        process.exit(0);
    });
});
setTimeout(() => process.exit(1), 5000);
