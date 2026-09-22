/**
 * Builds a Tally-compatible XML sales voucher for one invoice, importable via
 * Tally's Gateway of Tally -> Import Data -> Vouchers. Tally has no public
 * multi-tenant API — this file-based XML import is its actual integration
 * surface for third-party software.
 */
function esc(s: string): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function tallyDate(d: string | Date): string {
  const dt = new Date(d);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

export function buildTallyInvoiceXml(invoice: {
  invoiceNumber: string;
  invoiceDate: string | Date;
  client: { name: string };
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalAmount: number;
}): string {
  const date = tallyDate(invoice.invoiceDate);
  const ledgerCredits: string[] = [];

  ledgerCredits.push(`
      <ALLLEDGERENTRIES.LIST>
        <LEDGERNAME>Sales GST</LEDGERNAME>
        <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
        <AMOUNT>-${invoice.subtotal.toFixed(2)}</AMOUNT>
      </ALLLEDGERENTRIES.LIST>`);

  const gstLedger = (name: string, amt: number) =>
    amt > 0
      ? `
      <ALLLEDGERENTRIES.LIST>
        <LEDGERNAME>${name}</LEDGERNAME>
        <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
        <AMOUNT>-${amt.toFixed(2)}</AMOUNT>
      </ALLLEDGERENTRIES.LIST>`
      : "";

  ledgerCredits.push(gstLedger("Output CGST", invoice.cgst));
  ledgerCredits.push(gstLedger("Output SGST", invoice.sgst));
  ledgerCredits.push(gstLedger("Output IGST", invoice.igst));

  return `<ENVELOPE>
 <HEADER>
  <TALLYREQUEST>Import Data</TALLYREQUEST>
 </HEADER>
 <BODY>
  <IMPORTDATA>
   <REQUESTDESC>
    <REPORTNAME>Vouchers</REPORTNAME>
   </REQUESTDESC>
   <REQUESTDATA>
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <VOUCHER VCHTYPE="Sales" ACTION="Create">
      <DATE>${date}</DATE>
      <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
      <VOUCHERNUMBER>${esc(invoice.invoiceNumber)}</VOUCHERNUMBER>
      <PARTYLEDGERNAME>${esc(invoice.client.name)}</PARTYLEDGERNAME>
      <ALLLEDGERENTRIES.LIST>
        <LEDGERNAME>${esc(invoice.client.name)}</LEDGERNAME>
        <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
        <AMOUNT>${invoice.totalAmount.toFixed(2)}</AMOUNT>
      </ALLLEDGERENTRIES.LIST>${ledgerCredits.join("")}
     </VOUCHER>
    </TALLYMESSAGE>
   </REQUESTDATA>
  </IMPORTDATA>
 </BODY>
</ENVELOPE>`;
}

export function downloadTallyXml(filename: string, xml: string): void {
  const blob = new Blob([xml], { type: "application/xml;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
