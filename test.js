import { ServiceProvider } from "@entity-access/entity-access/dist/di/di.js";
import ServerPages from "./dist/ServerPages.js";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";


const sp = ServerPages.create();
sp.registerRoutes(join(dirname( fileURLToPath(import.meta.url)), "./dist/tests/logger"));

const app = sp.build();

app.listen(8080);