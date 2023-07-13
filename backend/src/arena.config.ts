import Arena from "@colyseus/arena";
import { monitor } from "@colyseus/monitor";
// import { Server } from "colyseus";

/* Import your Room files */
import { Part1Room } from "./rooms/Part1Room";
import { Part2Room } from "./rooms/Part2Room";
import { Part3Room } from "./rooms/Part3Room";
import { Part4Room } from "./rooms/Part4Room";

export default Arena({
	getId: () => "42 Pong",

	initializeGameServer: (gameServer) => {
		/* Define your room handlers */
		gameServer.define('Original', Part1Room);
		gameServer.define('Modern', Part2Room);
		gameServer.define('Private_Original', Part3Room);
		gameServer.define('Private_Modern', Part4Room);
	},

	initializeExpress: (app) => {
		/* Bind your custom express routes here */
		app.get("/", (req, res) => {
			res.send("Welcome to 42 Pong game server!");
		});

	/**
	 * Bind @colyseus/monitor
	 * It is recommended to protect this route with a password.
	 * Read more: https://docs.colyseus.io/tools/monitor/
	 */
		app.use("/colyseus", monitor());
	},


	beforeListen: () => {
		/**
		 * Before before gameServer.listen() is called.
		 */
	}
});