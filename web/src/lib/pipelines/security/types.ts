export interface ISessionCrypto {
  readonly algorithm: string;

  encrypt(plainText: string): Promise<string>;

  decrypt(cipherText: string): Promise<string>;
}
