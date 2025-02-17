import Inject, { RegisterSingleton } from "@entity-access/entity-access/dist/di/di.js";
import { createSecureContext, SecureContext } from "tls";
import AcmeCertificateService, { IAcmeOptions } from "./AcmeCertificateService.js";

@RegisterSingleton
export default class SecureContextService {

    @Inject
    certificateService: AcmeCertificateService;

    options: IAcmeOptions;

    defaultHost: string;

    map = new Map<string, Promise<SecureContext>>();

    public SNICallback = (servername, cb: (e: Error, context?: SecureContext) => void) => 
        this.getSecureContext(servername)
            .then((c) => cb(null, c))
            .catch((error) => {
                console.error(error);
                cb(error);
            });

    getSecureContext(host = this.defaultHost): Promise<SecureContext> {

        let c = this.map.get(host);
        if (!c) {
            c = this.certificateService.setup(host, this.options).then(({ cert, key }) => createSecureContext({ cert, key }));
        }
        return c;
    }

}