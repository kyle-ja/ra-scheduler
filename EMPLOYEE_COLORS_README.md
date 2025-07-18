# Employee Color Customization Guide

## Overview

The scheduler now supports color-coded calendar tiles for each employee, making it easy to visually identify who is assigned to which days. Each employee gets a unique color based on their position in the employee list.

## Features

- **20 unique colors** for up to 20 employees
- **Automatic text color selection** (black or white) based on background brightness for optimal readability
- **Interactive color legend** displayed below the calendar showing each employee's assigned color
- **Employee filtering** - click on employee names to show/hide their assigned days on the calendar
- **Visual feedback** - filtered employees appear dimmed with grayscale effect
- **Bulk actions** - "Show All" and "Hide All" buttons for quick filtering
- **Export compatibility** - filtering only affects display, not Excel exports
- **Easy customization** through CSS variables or JavaScript array

## How to Customize Colors

### Method 1: Edit CSS Variables (Recommended)

Edit the file `styles/employeeColors.css` and modify the CSS custom properties:

```css
:root {
  --employee-color-0: #FF6B6B;  /* Red - Employee 1 */
  --employee-color-1: #4ECDC4;  /* Teal - Employee 2 */
  --employee-color-2: #45B7D1;  /* Blue - Employee 3 */
  /* ... continue for all 20 colors ... */
}
```

### Method 2: Edit JavaScript Array

Edit the file `pages/roster.tsx` and modify the `EMPLOYEE_COLORS` array:

```javascript
const EMPLOYEE_COLORS = [
  '#FF6B6B', // Red - Employee 1
  '#4ECDC4', // Teal - Employee 2
  '#45B7D1', // Blue - Employee 3
  // ... add or modify colors as needed
];
```

## Color Guidelines

1. **Use hex colors** in the format `#RRGGBB` for consistency
2. **Ensure sufficient contrast** - the system automatically chooses black or white text
3. **Use distinct colors** that are easily distinguishable from each other
4. **Test accessibility** - consider color-blind users when choosing colors

## Default Color Palette

The system comes with 20 carefully selected colors:

1. **#FF6B6B** - Red
2. **#4ECDC4** - Teal  
3. **#45B7D1** - Blue
4. **#96CEB4** - Mint Green
5. **#FFEAA7** - Yellow
6. **#DDA0DD** - Plum
7. **#98D8C8** - Turquoise
8. **#F7DC6F** - Light Yellow
9. **#BB8FCE** - Light Purple
10. **#85C1E9** - Light Blue
11. **#F8C471** - Orange
12. **#82E0AA** - Light Green
13. **#F1948A** - Light Red
14. **#AED6F1** - Sky Blue
15. **#D7BDE2** - Lavender
16. **#A9DFBF** - Pale Green
17. **#F9E79F** - Pale Yellow
18. **#F5B7B1** - Pink
19. **#A3E4D7** - Aqua
20. **#D5A6BD** - Dusty Rose

## Alternative Palettes

The `employeeColors.css` file includes a commented-out alternative palette with more vibrant colors. Simply uncomment that section and comment out the default palette to use it.

## How Color Assignment Works

1. **Employee order matters** - the first employee in your roster gets the first color, second employee gets the second color, etc.
2. **Color cycling** - if you have more than 20 employees, colors will cycle back to the beginning
3. **Dynamic assignment** - colors are assigned based on the current employee list order

## How Employee Filtering Works

1. **Click to toggle** - click on any employee name in the legend to show/hide their calendar assignments
2. **Visual indicators** - visible employees show in full color with a checkmark, hidden employees appear dimmed with an X
3. **Bulk controls** - use "Show All" to display everyone or "Hide All" to hide everyone
4. **Display only** - filtering only affects what you see on the calendar, not data exports
5. **Auto-initialization** - when a schedule is generated, all employees are visible by default

## Troubleshooting

### Colors not showing up
- Make sure `styles/employeeColors.css` is imported in `pages/_app.tsx`
- Check that the build completed successfully with `npm run build`

### Text is hard to read
- The system automatically calculates text color, but you can manually test colors using online contrast checkers
- Consider choosing colors with mid-range brightness values for best automatic text color selection

### Need more than 20 colors
- Add additional colors to the `EMPLOYEE_COLORS` array in `pages/roster.tsx`
- Make sure to add corresponding CSS variables if using Method 1

## Testing Your Changes

After making changes:

1. Run `npm run build` to check for errors
2. Run `npm run dev` to test locally
3. Generate a test schedule to see your colors in action

## Support

If you need help customizing colors or run into issues, refer to the main application documentation or create an issue in the project repository. 