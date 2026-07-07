export const exampleColumns = [
  'Ticket ID',
  'QR Code',
  'Name',
  'Email',
  'Paid',
  'Entrance scanned at',
  'Friday day pass',
  'Friday day scanned at',
  'Saturday day pass',
  'Saturday day scanned at',
  'Friday dinner',
  'Friday dinner scanned at',
  'Saturday lunch',
  'Saturday lunch scanned at',
  'Drink tokens',
  'Drink scanned at',
]

export const exampleRows = [
  {
    'Ticket ID': 'TCK-1001',
    'QR Code': 'TCK-1001',
    Name: 'Ada Lovelace',
    Email: 'ada@example.com',
    Paid: 'yes',
    'Entrance scanned at': '',
    'Friday day pass': 'yes',
    'Friday day scanned at': '',
    'Saturday day pass': 'yes',
    'Saturday day scanned at': '',
    'Friday dinner': 'yes',
    'Friday dinner scanned at': '',
    'Saturday lunch': 'yes',
    'Saturday lunch scanned at': '',
    'Drink tokens': '2',
    'Drink scanned at': '',
  },
  {
    'Ticket ID': 'TCK-1002',
    'QR Code': 'TCK-1002',
    Name: 'Grace Hopper',
    Email: 'grace@example.com',
    Paid: 'yes',
    'Entrance scanned at': '',
    'Friday day pass': 'yes',
    'Friday day scanned at': '',
    'Saturday day pass': 'no',
    'Saturday day scanned at': '',
    'Friday dinner': 'no',
    'Friday dinner scanned at': '',
    'Saturday lunch': 'yes',
    'Saturday lunch scanned at': '',
    'Drink tokens': '1',
    'Drink scanned at': '',
  },
  {
    'Ticket ID': 'TCK-1003',
    'QR Code': 'TCK-1003',
    Name: 'Alan Turing',
    Email: 'alan@example.com',
    Paid: 'no',
    'Entrance scanned at': '',
    'Friday day pass': 'yes',
    'Friday day scanned at': '',
    'Saturday day pass': 'yes',
    'Saturday day scanned at': '',
    'Friday dinner': 'yes',
    'Friday dinner scanned at': '',
    'Saturday lunch': 'yes',
    'Saturday lunch scanned at': '',
    'Drink tokens': '0',
    'Drink scanned at': '',
  },
]

export function exampleCsv() {
  const escape = (value: string) => {
    if (!/[",\n]/.test(value)) {
      return value
    }
    return `"${value.replaceAll('"', '""')}"`
  }

  const lines = [
    exampleColumns.map(escape).join(','),
    ...exampleRows.map((row) => exampleColumns.map((column) => escape(row[column as keyof typeof row] ?? '')).join(',')),
  ]

  return `${lines.join('\n')}\n`
}

export function downloadExampleCsv() {
  const blob = new Blob([exampleCsv()], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'simple-festival-template.csv'
  link.click()
  URL.revokeObjectURL(url)
}
