import * as forge from "node-forge";
import * as crypto from "crypto";
import * as acme from "acme-client";
import DateTime from "@entity-access/entity-access/dist/types/DateTime.js";
import cluster from "cluster";
import { existsSync, writeFileSync, readFileSync, unlinkSync, mkdirSync } from "fs";
import { join } from "path"
import ensureDir, { deleteIfExists } from "../core/FileApi.js";
import Inject, { RegisterSingleton } from "@entity-access/entity-access/dist/di/di.js";
import ChallengeStore from "./ChallengeStore.js";

@RegisterSingleton
export default class ACME {

    @Inject
    private challengeStore: ChallengeStore;

    public async setup({
        host,
        sslMode = "./",
        accountPrivateKeyPath = "./",
        emailAddress = "",
        mode = "production" as "production" | "self-signed" | "staging",
        endPoint = "",
        eabKid = "",
        eabHmac = ""
    }) {

        if (mode === "self-signed") {
            return this.setupSelfSigned(sslMode);
        }

        const hostRoot = join(sslMode, host);

        ensureDir(hostRoot);

        const keyPath = join(hostRoot, "cert.key");
        const certPath = join(hostRoot, "cert.crt");

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

            let cert:string;
            let key:string;

            if (!existsSync(keyPath)) {
                deleteIfExists(certPath);
                key = (await acme.crypto.createPrivateRsaKey()).toString();
                writeFileSync(keyPath, key);
                console.log(`Creating key at ${keyPath}`);
            } else {
                key = readFileSync(keyPath, "utf8");
            }

            // load cert...
            if (existsSync(certPath)) {
                cert = readFileSync(certPath, "utf8");
                const certificate = new crypto.X509Certificate(cert);
                const validTo = DateTime.parse(certificate.validTo).diff(DateTime.now);
                if (validTo.totalDays > 30) {
                    console.log(`Reusing certificate, valid for ${validTo.totalDays}`);
                    return { cert , key };
                }
                console.log(`Deleting old certificates`);
                unlinkSync(certPath);
            }

            if (!cluster.isPrimary) {
                console.log(`Generating Self Signed SSL Certificate for ${host} in cluster worker. Contact administrator.`);
                return this.setupSelfSigned();
            }

            let accountKey;
            if( existsSync(accountPrivateKeyPath) ) {
                console.log("Reusing the account private key.");
                accountKey = readFileSync(accountPrivateKeyPath);
            } else {
                console.log("Creating new private key.");
                accountKey = await acme.crypto.createPrivateKey();
                writeFileSync(accountPrivateKeyPath, accountKey);
            }

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

            writeFileSync(certPath, cert);

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
