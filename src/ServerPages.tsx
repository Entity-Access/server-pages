import { ServiceProvider } from "@entity-access/entity-access/dist/di/di.js";
import Page from "./Page.js";

export default class ServerPages {

    public static create(globalServiceProvider: ServiceProvider) {
        return globalServiceProvider.create(ServerPages);
    }

    private routes: Map<string, Array<typeof Page>> = new Map();

    

}