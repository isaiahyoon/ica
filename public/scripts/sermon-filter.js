const servicePicker = document.querySelector('.service-picker');

if (servicePicker) {
  document.addEventListener('click', (event) => {
    if (!servicePicker.contains(event.target)) servicePicker.open = false;
  });
  servicePicker.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && servicePicker.open) {
      servicePicker.open = false;
      servicePicker.querySelector('summary').focus();
    }
  });
  servicePicker.addEventListener('focusout', (event) => {
    // Safari can clear focus before a tapped option receives its click.
    if (event.relatedTarget && !servicePicker.contains(event.relatedTarget)) servicePicker.open = false;
  });
}
