const formatPhoneNumber = (number, countryCode = '91') => {
    const cleaned = number.toString().replace(/\D/g, '');
    return cleaned.startsWith(countryCode) ? cleaned : `${countryCode}${cleaned}`;
  };
  
  module.exports = formatPhoneNumber;
  