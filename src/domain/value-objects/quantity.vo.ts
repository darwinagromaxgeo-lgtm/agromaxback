export class Quantity {
  private constructor(private readonly value: number) {
    if (value < 0) throw new Error('Quantity cannot be negative');
  }

  static create(value: number): Quantity {
    return new Quantity(value);
  }

  getValue(): number {
    return this.value;
  }

  add(other: Quantity): Quantity {
    return Quantity.create(this.value + other.getValue());
  }

  subtract(other: Quantity): Quantity {
    return Quantity.create(this.value - other.getValue());
  }

  isGreaterThanOrEqual(other: Quantity): boolean {
    return this.value >= other.getValue();
  }
}
