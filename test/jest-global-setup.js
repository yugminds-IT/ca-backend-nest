// Run unit tests in a timezone behind UTC (with DST) so date code that mixes local and UTC time fails here,
// not on a production server.
module.exports = async () => {
  process.env.TZ = 'America/New_York';
};
