import * as forge from "node-forge";
import * as crypto from "crypto";
import * as acme from "acme-client";
import DateTime from "@entity-access/entity-access/dist/types/DateTime.js";
import { existsSync, writeFileSync, readFileSync } from "fs";
import ensureDir from "../core/FileApi.js";
import Inject, { RegisterSingleton } from "@entity-access/entity-access/dist/di/di.js";
import ChallengeStore from "./AcmeChallengeStore.js";
import CertificateStore from "./CertificateStore.js";
import { FileLock } from "../core/FileLock.js";

export interface IAcmeOptions {
    sslMode?: string,
    accountPrivateKeyPath?: string,
    emailAddress?: string,
    mode?:  "production" | "self-signed" | "staging",
    endPoint?: string,
    eabKid?: string,
    eabHmac?: string   
}

@RegisterSingleton
export default class AcmeCertificateService {

    @Inject
    private challengeStore: ChallengeStore;

    @Inject
    private certificateStore: CertificateStore;

    public async setup(host, {
        sslMode = "/data/certs",
        emailAddress = "",
        mode = "production" as "production" | "self-signed" | "staging",
        endPoint = "",
        eabKid = "",
        eabHmac = ""
    }) {

        using fl = await FileLock.lock(host + ".lck");

        if (mode === "self-signed") {
            return this.setupSelfSigned(sslMode);
        }

        const logs = [];

        try {

            const maintainerEmail = emailAddress;

            let externalAccountBinding;

            if (eabKid) {
                externalAccountBinding = {
                    kid: eabKid,
                    hmacKey: eabHmac
                };
            }

            let { cert, key } = await this.certificateStore.get({ host });

            // load cert...
            if (cert) {
                const certificate = new crypto.X509Certificate(cert);
                const validTo = DateTime.parse(certificate.validTo).diff(DateTime.now);
                if (validTo.totalDays > 30) {
                    console.log(`Reusing certificate, valid for ${validTo.totalDays}`);
                    return { cert , key };
                }
            }

            const accountKey = await this.certificateStore.getAccountKey();

            acme.setLogger((message) => {
                // console.log(message);
                logs.push(message);
            });

            let altNames;

            // auto renew...
            const client = new acme.Client({
                directoryUrl: endPoint || acme.directory.letsencrypt[mode],
                accountKey,
                externalAccountBinding,
            });

            /* Create CSR */
            const [csrKey, csr] = await acme.crypto.createCsr({
                commonName: host,
                altNames
            }, key);



            /* Certificate */
            cert = await client.auto({
                csr,
                email: maintainerEmail,
                termsOfServiceAgreed: true,
                skipChallengeVerification: true,
                challengePriority: ["http-01"],
                challengeCreateFn: (authz, challenge, keyAuthorization) => {
                    if (challenge.type !== "http-01") {
                        return;
                    }
                    return this.challengeStore.save(challenge.token, keyAuthorization);
                },
                challengeRemoveFn: (authz, challenge, keyAuthorization) => {
                    return this.challengeStore.remove(challenge.token);
                },
            });

            await this.certificateStore.save({ host, cert, key });

            return { cert, key };
        } catch (error) {
            console.log(logs.join("\n"));
            console.error(error);
            throw error;
        }
    }

    public setupSelfSigned(sslMode = "./") {

        const selfSigned = `${sslMode}/self-signed/`;

        ensureDir(selfSigned);

        const certPath  = `${selfSigned}/cert.crt`;
        const keyPath  = `${selfSigned}/key.pem`;

        let key;
        let cert;

        if (existsSync(certPath) && existsSync(keyPath)) {
            key = readFileSync(keyPath);
            cert = readFileSync(certPath);
            return { key, cert };
        }

        const pki = forge.default.pki;

        // generate a key pair or use one you have already
        const keys = pki.rsa.generateKeyPair(2048);

        // create a new certificate
        const crt = pki.createCertificate();

        // fill the required fields
        crt.publicKey = keys.publicKey;
        crt.serialNumber = '01';
        crt.validity.notBefore = new Date();
        crt.validity.notAfter = new Date();
        crt.validity.notAfter.setFullYear(crt.validity.notBefore.getFullYear() + 40);

        // use your own attributes here, or supply a csr (check the docs)
        const attrs = [
            {
                name: 'commonName',
                value: 'dev.socialmail.in'
            }, {
                name: 'countryName',
                value: 'IN'
            }, {
                shortName: 'ST',
                value: 'Maharashtra'
            }, {
                name: 'localityName',
                value: 'Navi Mumbai'
            }, {
                name: 'organizationName',
                value: 'NeuroSpeech Technologies Pvt Ltd'
            }, {
                shortName: 'OU',
                value: 'Test'
            }
        ];

        // here we set subject and issuer as the same one
        crt.setSubject(attrs);
        crt.setIssuer(attrs);

        // the actual certificate signing
        crt.sign(keys.privateKey);

        // now convert the Forge certificate to PEM format
        cert = pki.certificateToPem(crt);
        key = pki.privateKeyToPem(keys.privateKey);

        writeFileSync(certPath, cert);
        writeFileSync(keyPath, key);

        return { key, cert };
    }
}
