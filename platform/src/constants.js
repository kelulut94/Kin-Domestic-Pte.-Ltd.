const SKILLS = {
  infant: "Infant care",
  childcare: "Child care",
  eldercare: "Elderly care",
  disability: "Special needs care",
  cooking: "Cooking",
  housekeeping: "Housekeeping",
  pets: "Pet care"
};

const NATIONALITIES = [
  "Myanmar", "Philippines", "Indonesia", "India", "Sri Lanka",
  "Bangladesh", "Cambodia", "Thailand", "Other"
];

const HELPER_TYPES = {
  fresh: "Fresh (first time working overseas)",
  experienced: "Experienced (has worked overseas)",
  transfer: "Transfer (currently working in Singapore)"
};

const TYPE_SHORT = { fresh: "Fresh", experienced: "Experienced", transfer: "Transfer" };

const MARITAL_STATUSES = ["Single", "Married", "Separated", "Divorced", "Widowed"];

const PROFILE_STATUS = {
  draft: "Draft",
  pending: "Waiting for review",
  approved: "Live",
  rejected: "Changes needed",
  hidden: "Hidden"
};

module.exports = { SKILLS, NATIONALITIES, HELPER_TYPES, TYPE_SHORT, MARITAL_STATUSES, PROFILE_STATUS };
