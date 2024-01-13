import { ServiceProvider } from "@entity-access/entity-access/dist/di/di";

export default class ServerPages {

    public static create(globalServiceProvider: ServiceProvider) {
        return globalServiceProvider.create(ServerPages);
    }

    

}