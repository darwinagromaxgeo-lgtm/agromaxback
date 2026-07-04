export class Ruc {
  private constructor(private readonly value: string) {}

  static create(ruc: string): Ruc {
    const cleaned = ruc.replace(/\s/g, '');
    if (!/^\d{11}$/.test(cleaned)) {
      throw new Error('RUC must be exactly 11 digits');
    }
    return new Ruc(cleaned);
  }

  getValue(): string {
    return this.value;
  }

  equals(other: Ruc): boolean {
    return this.value === other.value;
  }
}
