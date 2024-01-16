import * as forge from "node-forge";
import * as crypto from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";

export class SelfSigned {
    public static setupSelfSigned(sslMode = "./") {

        const selfSigned = `${sslMode}/self-signed/`;

        mkdirSync(selfSigned, { recursive: true });

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