export const COMPANY_DETAILS = {
  name: 'Hindustan Enterprises',
  legalName: 'Hindustan Enterprises',
  address: '# 1, New Bamboo, Bazaar, Mysore - 21',
  city: 'Mysore',
  state: 'Karnataka',
  stateCode: '29',
  pincode: '570021',
  country: 'India',
  gstin: '29AAAAA0000A1Z5',
  phone: '+91 98765 43210',
  email: 'info@hindustanenterprises.com',
  website: 'www.hindustanenterprises.com',
  bankDetails: {
    bankName: 'HDFC Bank',
    accountName: 'Hindustan Enterprises',
    accountNumber: '50200000000000',
    ifsc: 'HDFC0000001',
    branch: 'Mysore Main',
  }
};

export const numberToWords = (num: number): string => {
  if (num === 0) return 'Zero';
  
  const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const numToWords = (n: number): string => {
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : '');
    if (n < 1000) return a[Math.floor(n / 100)] + 'Hundred ' + (n % 100 !== 0 ? 'and ' + numToWords(n % 100) : '');
    if (n < 100000) return numToWords(Math.floor(n / 1000)) + 'Thousand ' + (n % 1000 !== 0 ? numToWords(n % 1000) : '');
    if (n < 10000000) return numToWords(Math.floor(n / 100000)) + 'Lakh ' + (n % 100000 !== 0 ? numToWords(n % 100000) : '');
    return numToWords(Math.floor(n / 10000000)) + 'Crore ' + (n % 10000000 !== 0 ? numToWords(n % 10000000) : '');
  };

  const integerPart = Math.floor(num);
  const fractionalPart = Math.round((num - integerPart) * 100);

  let result = numToWords(integerPart) + 'Rupees';
  if (fractionalPart > 0) {
    result += ' and ' + numToWords(fractionalPart) + 'Paise';
  }
  return result + ' Only';
};
