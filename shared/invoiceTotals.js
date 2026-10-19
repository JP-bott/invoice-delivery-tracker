export const VAT_RATE = 12;
export const VAT_TYPES = ['VATable', 'VAT-Exempt', 'Zero-Rated'];

function parseScaled(value, scale) {
  const raw = String(value ?? '').replace(/,/g, '').trim();
  if (!raw || !/^\d+(?:\.\d+)?$/.test(raw)) return 0;
  const [whole, fraction = ''] = raw.split('.');
  const digits = fraction.padEnd(scale, '0').slice(0, scale);
  if (fraction.length > scale && /[1-9]/.test(fraction.slice(scale))) return 0;
  return Number(whole) * (10 ** scale) + Number(digits || 0);
}

const roundDivide = (numerator, denominator) => Math.floor((numerator + denominator / 2) / denominator);
const pesos = (centavos) => centavos / 100;

export function computeInvoiceTotals({ amount = 0, vatType = 'VATable', withholdingRate = 0 } = {}) {
  const amountCentavos = parseScaled(amount, 2);
  const rateBasisPoints = parseScaled(withholdingRate, 2);
  const validVatType = VAT_TYPES.includes(vatType) ? vatType : 'VATable';
  const netOfVatCentavos = validVatType === 'VATable' ? roundDivide(amountCentavos * 100, 100 + VAT_RATE) : amountCentavos;
  const vatCentavos = validVatType === 'VATable' ? amountCentavos - netOfVatCentavos : 0;
  const withholdingCentavos = roundDivide(netOfVatCentavos * rateBasisPoints, 10000);
  const totalAmountDueCentavos = amountCentavos - withholdingCentavos;

  return {
    totalSales: pesos(amountCentavos),
    vat: pesos(vatCentavos),
    netOfVat: pesos(netOfVatCentavos),
    amountDue: pesos(netOfVatCentavos),
    addVat: pesos(vatCentavos),
    withholdingTax: pesos(withholdingCentavos),
    totalAmountDue: pesos(totalAmountDueCentavos),
    vatableSales: pesos(validVatType === 'VATable' ? netOfVatCentavos : 0),
    vatExemptSales: pesos(validVatType === 'VAT-Exempt' ? amountCentavos : 0),
    zeroRatedSales: pesos(validVatType === 'Zero-Rated' ? amountCentavos : 0),
    vatAmount: pesos(vatCentavos),
    vatType: validVatType,
    withholdingRate: rateBasisPoints / 100,
  };
}
